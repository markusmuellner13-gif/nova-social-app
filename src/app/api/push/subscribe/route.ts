import { NextRequest, NextResponse } from 'next/server';
import { cacheEnabled, cacheSet } from '@/lib/serverCache';

// Stores a web-push subscription (+ the user's city/coords) so the daily digest
// cron (/api/cron/push) can send "events near you". Persists in Redis when
// configured; otherwise accepts and no-ops (in-session reminders still work).
//
// Accepts both the new envelope { subscription, city, lat, lng } and the legacy
// bare PushSubscription for backwards compatibility.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      subscription?: { endpoint?: string };
      endpoint?: string;
      city?: string; lat?: number; lng?: number; categories?: unknown;
    };
    const sub = body.subscription ?? (body.endpoint ? body : null);
    if (!sub?.endpoint) {
      return NextResponse.json({ ok: false, error: 'invalid subscription' }, { status: 400 });
    }
    if (cacheEnabled) {
      // Key by a hash of the endpoint so re-subscribing overwrites cleanly.
      let h = 2166136261;
      for (let i = 0; i < sub.endpoint.length; i++) { h ^= sub.endpoint.charCodeAt(i); h = Math.imul(h, 16777619); }
      // Keep only a few short, sane category strings — these personalise the
      // push copy ("for the music lovers near you").
      const categories = Array.isArray(body.categories)
        ? body.categories.filter((c): c is string => typeof c === 'string').slice(0, 5).map(c => c.slice(0, 24))
        : null;
      const envelope = {
        subscription: sub,
        city: typeof body.city === 'string' ? body.city.slice(0, 80) : null,
        lat: Number.isFinite(body.lat) ? body.lat : null,
        lng: Number.isFinite(body.lng) ? body.lng : null,
        categories,
        ts: Date.now(),
      };
      await cacheSet(`nova:push:sub:${(h >>> 0).toString(36)}`, envelope, 60 * 60 * 24 * 60); // 60 days
    }
    return NextResponse.json({ ok: true, stored: cacheEnabled });
  } catch {
    return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 });
  }
}
