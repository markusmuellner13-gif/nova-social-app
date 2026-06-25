import { NextRequest, NextResponse } from 'next/server';
import { cacheEnabled, cacheScanKeys, cacheGet, cacheSet, cacheDelete } from '@/lib/serverCache';
import { webPushEnabled, sendPush, PushSub } from '@/lib/webpush';
import { dbReadEnabled, queryTopEventsNear } from '@/lib/eventsDb';
import { buildSmartPush, buildFriendGoingPush } from '@/lib/pushContent';
import { friendsGoingNear, socialServerEnabled } from '@/lib/socialServer';
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
  userId?: string | null;       // signed-in user id (for "friends going" nudges)
  ts?: number;
  lastPush?: number;            // when we last pushed to this user (cooldown)
}

// Cheap deterministic hash → a stable per-user seed so two subscribers in the
// same city don't receive the identical wording on the same day.
function seedFromKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 997;
}

// Approximate the user's LOCAL time from their longitude (15° ≈ 1 hour). Good
// enough to tell morning from evening worldwide without storing a timezone, so
// "Good morning" actually lands in the morning and "tonight" in the evening.
function localNowFromLng(lng: number | null | undefined): Date {
  const offsetH = Number.isFinite(lng) ? (lng as number) / 15 : 0;
  return new Date(Date.now() + offsetH * 3_600_000);
}

const MORNING = [6, 11];   // 06:00–10:59 local
const EVENING = [16, 22];  // 16:00–21:59 local
const COOLDOWN_MS = 10 * 60 * 60 * 1000; // never push the same user twice in 10h

function inWindow(hour: number, [start, end]: number[]): boolean {
  return hour >= start && hour < end;
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

  // slot=morning | evening targets users currently in that LOCAL window. No slot
  // → send to anyone in either window (a daily catch-all). The 10h cooldown means
  // a user gets at most a morning AND an evening push per day, never a barrage.
  const slot = (new URL(request.url).searchParams.get('slot') || '').toLowerCase();

  const keys = await cacheScanKeys('nova:push:sub:', 5000);
  const deadline = Date.now() + 45_000;
  const nowMs = Date.now();
  let sent = 0, removed = 0, processed = 0, skipped = 0;

  for (const key of keys) {
    if (Date.now() > deadline) break;
    const env = await cacheGet<Envelope>(key);
    if (!env?.subscription?.endpoint) continue;
    processed++;

    // Cooldown — don't re-push a user we already reached recently.
    if (env.lastPush && nowMs - env.lastPush < COOLDOWN_MS) { skipped++; continue; }

    // Only push during a sensible LOCAL window (their morning or evening).
    const local = localNowFromLng(env.lng);
    const hour = local.getHours();
    const isMorning = inWindow(hour, MORNING);
    const isEvening = inWindow(hour, EVENING);
    const wantSlot =
      slot === 'morning' ? isMorning :
      slot === 'evening' ? isEvening :
      (isMorning || isEvening);
    if (!wantSlot) { skipped++; continue; }

    // Strongest nudge first: is someone this user FOLLOWS going to an event near
    // them? If so, lead with that ("Anna is going 👀") instead of the generic
    // digest. Only when signed-in + the social backend (service key) is wired.
    let msg: { title: string; body: string };
    let url = '/';
    let tag = 'nova-digest';
    let friendPush: { title: string; body: string } | null = null;
    if (socialServerEnabled && env.userId && Number.isFinite(env.lat) && Number.isFinite(env.lng)) {
      const fg = await friendsGoingNear(env.userId, env.lat as number, env.lng as number).catch(() => null);
      if (fg) {
        friendPush = buildFriendGoingPush(fg.friendName, fg.title);
        url = `/e/${fg.postId}`;
        tag = 'nova-friend-going';
      }
    }

    if (friendPush) {
      msg = friendPush;
    } else {
      // Pull a rich, multi-category set of nearby events, then craft the copy
      // using the user's LOCAL time so "morning"/"tonight" framing is accurate.
      let nearby: ApiPost[] = [];
      if (dbReadEnabled && Number.isFinite(env.lat) && Number.isFinite(env.lng)) {
        nearby = await queryTopEventsNear({
          lat: env.lat as number, lng: env.lng as number, radiusKm: 50, limit: 12,
        }).catch(() => [] as ApiPost[]);
      }
      msg = buildSmartPush({
        city: env.city || 'your area',
        events: nearby,
        categories: Array.isArray(env.categories) ? env.categories : [],
        now: local,
        seed: seedFromKey(key),
      });
    }
    const payload = { ...msg, url, tag };

    const res = await sendPush(env.subscription, payload);
    if (res.ok) {
      sent++;
      // Record the send so the cooldown holds across the day's triggers.
      const ttl = Math.max(60, Math.floor(((env.ts ?? nowMs) + 60 * 24 * 3600_000 - nowMs) / 1000));
      await cacheSet(key, { ...env, lastPush: nowMs }, ttl).catch(() => {});
    } else if (res.gone) { await cacheDelete(key); removed++; }
  }

  return NextResponse.json({ ok: true, slot: slot || 'auto', sent, removed, skipped, processed, total: keys.length });
}
