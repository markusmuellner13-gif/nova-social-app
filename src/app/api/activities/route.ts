import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestGeo } from '@/lib/sources/geocode';
import { fetchOverpassPlaces, overpassToPost } from '@/lib/sources/osm';
import { fetchWikipediaNearby, fetchWikipediaSummary, wikiToPost, isSettlementArticle } from '@/lib/sources/wikipedia';
import { crawlCityEvents } from '@/lib/sources/webCrawler';
import { finalizePhotos } from '@/lib/sources/venuePhoto';
import { dedupePosts, dropExpired, withDistance, type ApiPost } from '@/lib/sources/shared';
import { queryEventsNear } from '@/lib/eventsDb';
import { dbReadEnabled } from '@/lib/eventsDb';
import { cacheGet, cacheSet } from '@/lib/serverCache';
import {
  classifyActivity, enrichWithTickets, rankActivities,
  type ActivityKind, type ActivityPost,
} from '@/lib/sources/activities';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// "Far Far Away" — what to do in a city you are not in yet.
//
// Deliberately NOT a self-call to /api/feed. A server-side fetch carries no
// x-forwarded-for, so middleware buckets every such call under the same
// 'unknown' client at the ai tier's 20/min — meaning a handful of users would
// have starved each other. We compose the same sources directly instead, which
// is also two hops faster.
//
// Everything served here is real: OSM tourism tags, Wikipedia landmarks, our
// own events DB, and pages read by the extraction engine. Nothing is generated
// to fill the grid — an empty city returns an empty list and says so.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' };

const VALID_KINDS = new Set<ActivityKind>(['museum', 'sightseeing', 'activity', 'tour', 'event']);

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Turn the tab's date chip into a concrete window. */
function dateWindow(when: string, fromParam?: string, toParam?: string): { from?: string; to?: string } {
  const isDate = (s?: string | null) => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));
  if (isDate(fromParam) || isDate(toParam)) {
    return { from: isDate(fromParam) ? fromParam! : undefined, to: isDate(toParam) ? toParam! : undefined };
  }
  const now = new Date();
  const today = iso(now);
  const plus = (days: number) => iso(new Date(now.getTime() + days * 86_400_000));
  switch (when) {
    case 'today':    return { from: today, to: today };
    case 'weekend': {
      // Next Fri→Sun, or this one if we're already in it.
      const dow = now.getDay();
      const toFri = dow === 0 ? 5 : (5 - dow + 7) % 7;
      const from = dow === 6 || dow === 0 ? today : plus(toFri);
      return { from, to: plus(dow === 0 ? 0 : toFri + 2) };
    }
    case 'week':     return { from: today, to: plus(7) };
    case 'month':    return { from: today, to: plus(30) };
    default:         return {};                 // "anytime"
  }
}

/** Resolve within `ms`, giving back whatever a slow source managed. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** Museums, galleries, landmarks and viewpoints straight from OSM tourism tags. */
async function osmAttractions(lat: number, lng: number, city: string, radiusKm: number, count: number): Promise<ApiPost[]> {
  const elements = await fetchOverpassPlaces(lat, lng, 'sightseeing', Math.min(radiusKm * 1000, 12000));
  if (elements.length === 0) return [];
  return Promise.all(
    elements.slice(0, count).map(el => overpassToPost(el, city, 'sightseeing', '', /* tryRealPhoto */ true)),
  );
}

/** Notable landmarks with a real photo and a real description. */
async function wikipediaLandmarks(lat: number, lng: number, city: string, radiusKm: number, count: number): Promise<ApiPost[]> {
  const nearby = await fetchWikipediaNearby(lat, lng, Math.min(radiusKm * 1000, 10000), 0, city);
  const pois = nearby.slice(0, count);
  if (pois.length === 0) return [];
  const summaries = await Promise.all(pois.map(p => fetchWikipediaSummary(p.title)));
  const kept = pois
    .map((poi, i) => ({ poi, summary: summaries[i] }))
    .filter(({ summary }) => !isSettlementArticle(summary?.description));
  return Promise.all(kept.map(({ poi, summary }) =>
    wikiToPost(poi, summary, (summary?.extract ?? `${poi.title} in ${city}.`).slice(0, 300), city),
  ));
}

/** Dated things — from our own DB first, since the ingest cron keeps it warm. */
async function datedFromDb(
  lat: number, lng: number, radiusKm: number, from: string | undefined, count: number,
): Promise<ApiPost[]> {
  if (!dbReadEnabled || (!lat && !lng)) return [];
  try {
    const rows = await queryEventsNear({
      lat, lng, radiusKm: Math.max(radiusKm, 25), category: 'events',
      afterIso: new Date(from ? `${from}T00:00:00Z` : Date.now()).toISOString(),
      limit: count * 2, offset: 0,
    });
    return rows;
  } catch { return []; }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const cityParam    = (searchParams.get('city')    ?? '').slice(0, 100).replace(/[<>'"\\]/g, '');
  const countryParam = (searchParams.get('country') ?? '').slice(0, 100).replace(/[<>'"\\]/g, '');
  const count  = Math.max(4, Math.min(30, parseInt(searchParams.get('count') || '18', 10) || 18));
  const radius = Math.max(1, Math.min(100, parseInt(searchParams.get('radius') || '30', 10) || 30));
  const when   = (searchParams.get('when') ?? 'anytime').slice(0, 12);
  const kindsParam = (searchParams.get('kinds') ?? '').split(',')
    .map(s => s.trim()).filter((s): s is ActivityKind => VALID_KINDS.has(s as ActivityKind));

  const { lat, lng, city, country } = await resolveRequestGeo(
    request.headers, searchParams.get('lat'), searchParams.get('lng'), cityParam, countryParam,
  );
  if (!city && !lat && !lng) {
    return NextResponse.json({ posts: [], city: '', country: '', note: 'no location' }, { headers: CACHE_HEADERS });
  }

  const { from, to } = dateWindow(when, searchParams.get('from') ?? undefined, searchParams.get('to') ?? undefined);

  // Cache on everything that changes the answer. Kinds are sorted so ?kinds=a,b
  // and ?kinds=b,a share one entry.
  const cacheKey = `nova:activities:${city.toLowerCase()}:${lat.toFixed(2)}:${lng.toFixed(2)}`
    + `:${from ?? '*'}:${to ?? '*'}:${[...kindsParam].sort().join('+') || 'all'}:${count}`;
  const cached = await cacheGet<{ posts: ActivityPost[] }>(cacheKey).catch(() => null);
  if (cached?.posts?.length) {
    return NextResponse.json({ ...cached, city, country, cached: true }, { headers: CACHE_HEADERS });
  }

  // Fan out. Each source is individually time-boxed and individually allowed to
  // fail — a city with no Wikipedia coverage still gets its museums.
  // Overpass is the slow one — 15–22s on a cold area, ~1s warm. It is capped
  // below the others' patience deliberately: Wikipedia alone already fills the
  // grid, so OSM's contribution (venues that carry a `website` tag, which is
  // where ticket links come from) is worth waiting for but not worth making
  // every first visitor wait 25 seconds. Whatever it returns after the cap
  // still lands in the caches for the next request.
  const [osm, wiki, dbEvents, crawled] = await Promise.all([
    withTimeout(osmAttractions(lat, lng, city, radius, count), 14_000, [] as ApiPost[]),
    withTimeout(wikipediaLandmarks(lat, lng, city, radius, count), 12_000, [] as ApiPost[]),
    withTimeout(datedFromDb(lat, lng, radius, from, count), 6_000, [] as ApiPost[]),
    withTimeout(
      crawlCityEvents({ city, country, lat, lng, category: 'events', count, page: 0 }),
      14_000, [] as ApiPost[],
    ),
  ]);

  let pool = dropExpired(dedupePosts([...osm, ...wiki, ...dbEvents, ...crawled]));
  pool = withDistance(pool, lat, lng).filter(p => p.distanceKm == null || p.distanceKm <= radius);

  // Date window applies to dated things only — a museum is open whatever chip
  // the user picked, and hiding it would empty the grid for "this weekend".
  const inWindow = pool.filter(p => {
    if (!p.eventDateRaw) return true;
    if (from && p.eventDateRaw < from) return false;
    if (to && p.eventDateRaw > to) return false;
    return true;
  });

  let activities: ActivityPost[] = inWindow.map(p => ({ ...p, activityKind: classifyActivity(p) }));
  if (kindsParam.length) activities = activities.filter(a => kindsParam.includes(a.activityKind));

  // Photos first (the existing pipeline, incl. the real-image gate), then the
  // ticket-link pass over the page we're actually going to show.
  const head = activities.slice(0, count);
  const withPhotos = await finalizePhotos(head, 3500) as ActivityPost[];
  const enriched = await enrichWithTickets(
    withPhotos.map((p, i) => ({ ...p, activityKind: head[i].activityKind })),
    { budgetMs: 9000, batch: 8 },
  );
  const ranked = rankActivities(enriched, { city, country, lat, lng, from, to });

  const body = {
    posts: ranked,
    city,
    country,
    window: { from: from ?? null, to: to ?? null },
    counts: {
      total: ranked.length,
      withTickets: ranked.filter(p => p.ticketUrl).length,
      byKind: ranked.reduce<Record<string, number>>((acc, p) => {
        acc[p.activityKind] = (acc[p.activityKind] ?? 0) + 1;
        return acc;
      }, {}),
    },
  };

  if (ranked.length > 0) {
    // 30 min: long enough to matter for a city several users look at, short
    // enough that a newly ingested event shows up the same afternoon.
    await cacheSet(cacheKey, { posts: ranked }, 1800).catch(() => { /* cache is optional */ });
  }

  return NextResponse.json(body, { headers: CACHE_HEADERS });
}
