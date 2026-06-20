import { NextRequest, NextResponse } from 'next/server';
import { dbWriteEnabled, upsertEvents, purgeExpiredEvents, postToRow } from '@/lib/eventsDb';
import type { ApiPost } from '@/lib/sources/shared';

export const maxDuration = 60; // Hobby plan cap; the route self-limits to ~45s and resumes via ?offset

// ─────────────────────────────────────────────────────────────────────────────
// Ingestion worker — populates the app's OWN events DB so users are served from
// Postgres (fast, cheap, scalable) instead of hitting live third-party APIs per
// request. It reuses /api/feed?fresh=1 (which already orchestrates Ticketmaster /
// SeatGeek / OSM / Wikipedia, enrichment, images, dedup) and upserts the results.
//
// Runs on the Vercel cron (see vercel.json). No-ops unless SUPABASE_SERVICE_ROLE_KEY
// is configured (writes need it). Reads/serving fall back to live until then.
// ─────────────────────────────────────────────────────────────────────────────

// Worldwide coverage so every user — wherever they open the app — is served
// from our own DB. Austria is dense (the home market: Vienna, Graz, Linz,
// Salzburg, Innsbruck, Baden, Wiener Neustadt, Klagenfurt) plus the major
// European and global metros. The cron resumes across days via ?offset, so a
// long list is fine — each daily slice just refreshes the next chunk.
const CITIES: [string, string, number, number][] = [
  // ── Austria (home market) ──
  ['Vienna',          'Austria',     48.2082, 16.3738],
  ['Graz',            'Austria',     47.0707, 15.4395],
  ['Linz',            'Austria',     48.3069, 14.2858],
  ['Salzburg',        'Austria',     47.8095, 13.0550],
  ['Innsbruck',       'Austria',     47.2692, 11.4041],
  ['Klagenfurt',      'Austria',     46.6247, 14.3050],
  ['Baden',           'Austria',     48.0059, 16.2342],
  ['Wiener Neustadt', 'Austria',     47.8149, 16.2425],
  ['Bregenz',         'Austria',     47.5031,  9.7471],
  ['St. Pölten',      'Austria',     48.2047, 15.6256],
  // ── Italy ──
  ['Rome',            'Italy',       41.9028, 12.4964],
  ['Milan',           'Italy',       45.4642,  9.1900],
  ['Florence',        'Italy',       43.7696, 11.2558],
  ['Venice',          'Italy',       45.4408, 12.3155],
  ['Naples',          'Italy',       40.8518, 14.2681],
  ['Turin',           'Italy',       45.0703,  7.6869],
  ['Bologna',         'Italy',       44.4949, 11.3426],
  // ── Germany / Switzerland ──
  ['Berlin',          'Germany',     52.5200, 13.4050],
  ['Munich',          'Germany',     48.1351, 11.5820],
  ['Hamburg',         'Germany',     53.5511,  9.9937],
  ['Cologne',         'Germany',     50.9375,  6.9603],
  ['Frankfurt',       'Germany',     50.1109,  8.6821],
  ['Zurich',          'Switzerland', 47.3769,  8.5417],
  // ── Rest of Europe ──
  ['London',          'UK',          51.5074, -0.1278],
  ['Paris',           'France',      48.8566,  2.3522],
  ['Barcelona',       'Spain',       41.3851,  2.1734],
  ['Madrid',          'Spain',       40.4168, -3.7038],
  ['Amsterdam',       'Netherlands', 52.3676,  4.9041],
  ['Prague',          'Czechia',     50.0755, 14.4378],
  ['Budapest',        'Hungary',     47.4979, 19.0402],
  ['Lisbon',          'Portugal',    38.7223, -9.1393],
  ['Dublin',          'Ireland',     53.3498, -6.2603],
  ['Copenhagen',      'Denmark',     55.6761, 12.5683],
  // ── Americas / Asia / Oceania ──
  ['New York',        'USA',         40.7128, -74.0060],
  ['Los Angeles',     'USA',         34.0522, -118.2437],
  ['Toronto',         'Canada',      43.6532, -79.3832],
  ['Dubai',           'UAE',         25.2048, 55.2708],
  ['Tokyo',           'Japan',       35.6762, 139.6503],
  ['Sydney',          'Australia',  -33.8688, 151.2093],
];

// Every category the app surfaces, so each city carries a full spread across
// all chips. Place categories come from OSM, sightseeing from Wikipedia,
// events/music/sports/art from Ticketmaster/SeatGeek/Eventbrite, and the
// long-tail (food/fitness/lifestyle/community/tech/fashion/travel/pets) is
// filled by Eventbrite + the AI web-search fallback when the fast sources are
// sparse — exactly mirroring the live /api/feed behaviour.
const CATEGORIES = [
  'events', 'music', 'sports', 'art', 'sightseeing',
  'restaurants', 'hotels', 'rentals', 'venues', 'shops',
  'food', 'fitness', 'lifestyle', 'community', 'tech', 'fashion', 'travel', 'pets',
];

function sourceOf(id: string): string {
  return (id.split('_')[0] || 'feed').slice(0, 12);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }
  if (!dbWriteEnabled) {
    return NextResponse.json({ ok: false, ingested: 0, note: 'DB writes disabled (set SUPABASE_SERVICE_ROLE_KEY)' });
  }

  const origin = new URL(request.url).origin;

  // Flatten to (city × category) work items so we can resume across invocations —
  // the Hobby plan caps functions at ~60s, so each call processes a time-bounded
  // slice and returns nextOffset. Call repeatedly until done=true.
  const work: { city: string; country: string; lat: number; lng: number; category: string }[] = [];
  for (const [city, country, lat, lng] of CITIES) {
    for (const category of CATEGORIES) work.push({ city, country, lat, lng, category });
  }

  const sp = new URL(request.url).searchParams;
  // When invoked by the daily cron (no offset), rotate the starting point each
  // day so every city gets refreshed over a few days despite the 60s cap.
  const dayRotation = (Math.floor(Date.now() / 86_400_000) * 21) % work.length;
  const offset = sp.has('offset')
    ? Math.max(0, parseInt(sp.get('offset') || '0', 10))
    : dayRotation;
  // Stay well under the 60s platform cap. The deadline is checked *between*
  // items, and any single item can run up to its own fetch timeout past that
  // check — so deadline + per-item timeout must stay < 60s. 35s + 14s = 49s.
  const deadline = Date.now() + 35_000;

  let ingested = 0;
  let processed = 0;
  const errors: string[] = [];

  let i = offset;
  for (; i < work.length; i++) {
    if (Date.now() > deadline) break;
    const { city, country, lat, lng, category } = work[i];
    try {
      const params = new URLSearchParams({
        city, country, lat: String(lat), lng: String(lng),
        page: '0', radius: '25', count: '12', category, fresh: '1',
      });
      const res = await fetch(`${origin}/api/feed?${params}`, { signal: AbortSignal.timeout(14000) });
      if (!res.ok) { errors.push(`${city}/${category}:${res.status}`); processed++; continue; }
      const data = await res.json() as { posts?: ApiPost[] };
      const posts = (data.posts ?? []).filter(p => p && p.id && p.location?.lat);
      if (posts.length) {
        const rows = posts.map(p => postToRow(p, sourceOf(p.id)));
        ingested += await upsertEvents(rows);
      }
      processed++;
    } catch (err) {
      errors.push(`${city}/${category}:${err instanceof Error ? err.message : 'err'}`);
      processed++;
    }
  }

  const done = i >= work.length;
  await purgeExpiredEvents().catch(() => {}); // cheap single DELETE; run every time

  return NextResponse.json({
    ok: true, ingested, processed, offset, nextOffset: done ? null : i,
    total: work.length, done, errors: errors.slice(0, 8),
  });
}
