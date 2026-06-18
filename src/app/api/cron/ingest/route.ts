import { NextRequest, NextResponse } from 'next/server';
import { dbWriteEnabled, upsertEvents, purgeExpiredEvents, postToRow } from '@/lib/eventsDb';
import type { ApiPost } from '@/lib/sources/shared';

export const maxDuration = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Ingestion worker — populates the app's OWN events DB so users are served from
// Postgres (fast, cheap, scalable) instead of hitting live third-party APIs per
// request. It reuses /api/feed?fresh=1 (which already orchestrates Ticketmaster /
// SeatGeek / OSM / Wikipedia, enrichment, images, dedup) and upserts the results.
//
// Runs on the Vercel cron (see vercel.json). No-ops unless SUPABASE_SERVICE_ROLE_KEY
// is configured (writes need it). Reads/serving fall back to live until then.
// ─────────────────────────────────────────────────────────────────────────────

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

// DB-friendly categories (served by fast APIs: Ticketmaster/SeatGeek/OSM/Wikipedia)
const CATEGORIES = ['events', 'music', 'sports', 'art', 'restaurants', 'hotels', 'rentals', 'venues', 'sightseeing'];

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
  let ingested = 0;
  const errors: string[] = [];

  for (const [city, country, lat, lng] of CITIES) {
    for (const category of CATEGORIES) {
      try {
        const params = new URLSearchParams({
          city, country, lat: String(lat), lng: String(lng),
          page: '0', radius: '25', count: '20', category, fresh: '1',
        });
        const res = await fetch(`${origin}/api/feed?${params}`, { signal: AbortSignal.timeout(40000) });
        if (!res.ok) { errors.push(`${city}/${category}:${res.status}`); continue; }
        const data = await res.json() as { posts?: ApiPost[] };
        const posts = (data.posts ?? []).filter(p => p && p.id && p.location?.lat);
        if (!posts.length) continue;
        const rows = posts.map(p => postToRow(p, sourceOf(p.id)));
        ingested += await upsertEvents(rows);
      } catch (err) {
        errors.push(`${city}/${category}:${err instanceof Error ? err.message : 'err'}`);
      }
    }
  }

  await purgeExpiredEvents().catch(() => {});

  return NextResponse.json({ ok: true, ingested, cities: CITIES.length, categories: CATEGORIES.length, errors: errors.slice(0, 12) });
}
