import { NextRequest, NextResponse } from 'next/server';
import { cacheEnabled, cacheScanKeys, cacheGet, cacheDelete } from '@/lib/serverCache';
import { webPushEnabled, sendPush, PushSub } from '@/lib/webpush';
import { dbReadEnabled, queryTopEventsNear } from '@/lib/eventsDb';
import { buildSmartPush } from '@/lib/pushContent';
import type { ApiPost } from '@/lib/sources/shared';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Daily "events near you" push digest — the retention loop.
//
// Walks every stored push subscription and sends each user the soonest upcoming
// event near their saved city (from our events DB), so people come back even
// when the app is closed. Time-bounded to stay under the function cap; dead
// subscriptions (404/410) are pruned.
//
// Triggered by the daily warm cron (see /api/cron/warm) to avoid a 3rd Vercel
// cron entry. Can also be called directly with the CRON_SECRET. No-ops cleanly
// until VAPID keys + Redis are configured.
// ─────────────────────────────────────────────────────────────────────────────

interface Envelope {
  subscription: PushSub;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  categories?: string[] | null; // the user's learned top interests
}

// Cheap deterministic hash → a stable per-user seed so two subscribers in the
// same city don't receive the identical wording on the same day.
function seedFromKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 997;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }
  if (!webPushEnabled) {
    return NextResponse.json({ ok: false, sent: 0, note: 'web push disabled (set NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY)' });
  }
  if (!cacheEnabled) {
    return NextResponse.json({ ok: false, sent: 0, note: 'no subscription store (set Redis/Upstash)' });
  }

  const keys = await cacheScanKeys('nova:push:sub:', 5000);
  const deadline = Date.now() + 45_000;
  let sent = 0, removed = 0, processed = 0;

  for (const key of keys) {
    if (Date.now() > deadline) break;
    const env = await cacheGet<Envelope>(key);
    if (!env?.subscription?.endpoint) continue;
    processed++;

    // Pull a rich, multi-category set of nearby events, then craft the copy.
    let nearby: ApiPost[] = [];
    if (dbReadEnabled && Number.isFinite(env.lat) && Number.isFinite(env.lng)) {
      nearby = await queryTopEventsNear({
        lat: env.lat as number, lng: env.lng as number, radiusKm: 50, limit: 12,
      }).catch(() => [] as ApiPost[]);
    }

    const msg = buildSmartPush({
      city: env.city || 'your area',
      events: nearby,
      categories: Array.isArray(env.categories) ? env.categories : [],
      seed: seedFromKey(key),
    });
    const payload = { ...msg, url: '/', tag: 'nova-digest' };

    const res = await sendPush(env.subscription, payload);
    if (res.ok) sent++;
    else if (res.gone) { await cacheDelete(key); removed++; }
  }

  return NextResponse.json({ ok: true, sent, removed, processed, total: keys.length });
}
