import { NextRequest, NextResponse } from 'next/server';
import { cacheEnabled } from '@/lib/serverCache';

export const maxDuration = 300; // warming many cities can take a while

// ─────────────────────────────────────────────────────────────────────────────
// Ingestion warmer — runs on a Vercel cron (see vercel.json). For each popular
// city it forces a fresh computation of the heaviest categories and stores the
// result in the Redis cache, so real users always hit a warm cache and get
// instant, real-time-fresh content instead of waiting 10-20s for live APIs.
//
// No-ops cleanly if the cache isn't configured (nothing to warm into).
// ─────────────────────────────────────────────────────────────────────────────

// City, country, lat, lng — Italy-first (the paid-posts target market) plus the
// app's home cities. Extend freely; each entry costs a few seconds to warm.
const CITIES: [string, string, number, number][] = [
  ['Rome',     'Italy',   41.9028, 12.4964],
  ['Milan',    'Italy',   45.4642,  9.1900],
  ['Florence', 'Italy',   43.7696, 11.2558],
  ['Venice',   'Italy',   45.4408, 12.3155],
  ['Naples',   'Italy',   40.8518, 14.2681],
  ['Turin',    'Italy',   45.0703,  7.6869],
  ['Bologna',  'Italy',   44.4949, 11.3426],
  ['Verona',   'Italy',   45.4384, 10.9916],
  ['Vienna',   'Austria', 48.2082, 16.3738],
];

// Categories worth pre-computing (the slow/expensive ones).
const CATEGORIES = ['events', 'music', 'restaurants', 'sightseeing', 'community'];

export async function GET(request: NextRequest) {
  // Protect the endpoint: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  if (!cacheEnabled) {
    return NextResponse.json({ ok: false, warmed: 0, note: 'cache not configured (set UPSTASH_REDIS_REST_URL/TOKEN)' });
  }

  const origin = new URL(request.url).origin;
  let warmed = 0;
  const errors: string[] = [];

  for (const [city, country, lat, lng] of CITIES) {
    for (const category of CATEGORIES) {
      try {
        const params = new URLSearchParams({
          city, country, lat: String(lat), lng: String(lng),
          page: '0', radius: '25', count: '8', category, fresh: '1',
        });
        const res = await fetch(`${origin}/api/feed?${params}`, { signal: AbortSignal.timeout(45000) });
        if (res.ok) warmed++;
        else errors.push(`${city}/${category}:${res.status}`);
      } catch (err) {
        errors.push(`${city}/${category}:${err instanceof Error ? err.message : 'err'}`);
      }
    }
  }

  // Fire the daily "events near you" push digest as a sub-step (keeps us to two
  // Vercel cron entries). Best-effort + gated — no-ops without VAPID keys.
  const cronHeaders = secret ? { Authorization: `Bearer ${secret}` } : undefined;
  let pushResult: unknown = null;
  try {
    const pres = await fetch(`${origin}/api/cron/push`, { headers: cronHeaders, signal: AbortSignal.timeout(55000) });
    pushResult = await pres.json().catch(() => null);
  } catch { /* push digest is best-effort */ }

  // Nova Brain's maintenance + self-report pass, chained here for the same
  // reason as the push digest: the Hobby plan caps how many cron entries we get,
  // and this job is cheap.
  let brainResult: unknown = null;
  try {
    const bres = await fetch(`${origin}/api/cron/brain`, { headers: cronHeaders, signal: AbortSignal.timeout(30000) });
    brainResult = await bres.json().catch(() => null);
  } catch { /* best-effort */ }

  return NextResponse.json({
    ok: true, warmed, total: CITIES.length * CATEGORIES.length,
    push: pushResult, brain: brainResult, errors: errors.slice(0, 10),
  });
}
