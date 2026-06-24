import { NextRequest, NextResponse } from 'next/server';
import { ApiPost, dedupePosts, dropExpired, withDistance, todayStr, haversineKm, ensureUniqueImages } from '@/lib/sources/shared';
import { resolveRequestGeo } from '@/lib/sources/geocode';
import { fetchTicketmaster, tmEventToPost, TM_CATEGORY_MAP } from '@/lib/sources/ticketmaster';
import { fetchEventbriteEvents } from '@/lib/sources/eventbrite';
import { fetchOverpassPlaces, overpassToPost } from '@/lib/sources/osm';
import { fetchWikipediaNearby, fetchWikipediaSummary, wikiToPost, isWorthSightseeing, isSettlementArticle } from '@/lib/sources/wikipedia';
import { fetchSeatGeekEvents } from '@/lib/sources/seatgeek';
import {
  enrichEventDescriptions, enrichSightseeingDescriptions,
  searchRealEventsWithClaude,
} from '@/lib/sources/claudeAI';
import { crawlCityEvents } from '@/lib/sources/webCrawler';
import { eventsCacheKey, cacheTtl, cacheGet, cacheSet } from '@/lib/serverCache';
import { dbReadEnabled, queryEventsNear, queryEventsByCountry } from '@/lib/eventsDb';
import { aiBudgetExceeded, noteAiCall } from '@/lib/aiBudget';

export const maxDuration = 60;

// Coordinates are rounded client-side (~100m), so identical-area requests hit
// the same edge-cache entry. Events stay fresh (4 min), places cache longer.
const EVENT_CACHE = { 'Cache-Control': 'public, s-maxage=240, stale-while-revalidate=900' };
const PLACE_CACHE = { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600' };

const VALID_CATEGORIES = new Set([
  'events','music','sports','art','fitness','food',
  'sightseeing','lifestyle','discover','shops','venues','community',
  'restaurants','hotels','rentals','travel','tech','pets','fashion',
]);

// Categories served purely by OpenStreetMap places (no ticketed-event side) —
// these take the fast single-source path.
const OSM_CATEGORIES = new Set(['shops','venues','restaurants','hotels','rentals','pets','fashion','lifestyle']);

// Categories that have BOTH events (Ticketmaster/Eventbrite/SeatGeek) AND real
// places (OSM): we blend them so the feed mixes "what's on" with "where to go",
// and — crucially — a small town with no ticketed events still fills up with its
// real museums, churches, clubs, gyms, markets and parks. All free, no LLM.
const OSM_BLEND_CATEGORIES = new Set(['events','art','community','music','fitness','sports','travel','sightseeing']);

// Eventbrite vertical exists for these (see EB_CATEGORY_SLUGS)
const EB_CATEGORIES = new Set([
  'events','music','food','restaurants','sports','fitness','art','tech',
  'community','fashion','lifestyle','travel','sightseeing','discover',
]);

const SG_CATEGORIES = new Set(['events','music','sports','art','discover']);

// ─────────────────────────────────────────────────────────────────────────────
// Per-source fetchers, each returning a (possibly empty) list of posts
// ─────────────────────────────────────────────────────────────────────────────

async function ticketmasterPosts(
  lat: number, lng: number, city: string, category: string, page: number,
  radius: number, count: number, days: number, tmKey: string, claudeKey?: string
): Promise<{ posts: ApiPost[]; hasMore: boolean }> {
  // Smart radius: expand automatically when the local area is sparse
  let { events, totalPages } = await fetchTicketmaster(lat, lng, category, page, radius, tmKey, days);
  if (events.length < 4 && radius <= 25) {
    const exp = await fetchTicketmaster(lat, lng, category, page, 75, tmKey, days).catch(() => ({ events: [], totalPages: 0 }));
    if (exp.events.length > events.length) { events = exp.events; totalPages = exp.totalPages; }
  }
  if (events.length < 4 && radius <= 75) {
    const exp = await fetchTicketmaster(lat, lng, category, page, 150, tmKey, days).catch(() => ({ events: [], totalPages: 0 }));
    if (exp.events.length > events.length) { events = exp.events; totalPages = exp.totalPages; }
  }
  if (events.length === 0) return { posts: [], hasMore: false };

  const today = todayStr();
  const enrichInput = events.map(ev => ({
    name: ev.name,
    venue: ev._embedded?.venues?.[0]?.name ?? city,
    date: ev.dates?.start?.localDate ?? today,
    time: ev.dates?.start?.localTime?.slice(0, 5) ?? '',
    genre: ev.classifications?.[0]?.genre?.name ?? ev.classifications?.[0]?.segment?.name ?? 'Event',
    price: ev.priceRanges?.[0]
      ? `${ev.priceRanges[0].currency} ${ev.priceRanges[0].min.toFixed(0)}–${ev.priceRanges[0].max.toFixed(0)}`
      : 'See website',
  }));
  const fallbackDescs = events.map(ev => `${ev.name} at ${ev._embedded?.venues?.[0]?.name ?? city}.`);
  const descriptions = claudeKey
    ? await enrichEventDescriptions(enrichInput, city, claudeKey).catch(() => fallbackDescs)
    : fallbackDescs;

  return {
    posts: events.map((ev, i) => tmEventToPost(ev, descriptions[i] ?? '', city)),
    hasMore: page < totalPages - 1,
  };
}

async function osmPosts(
  lat: number, lng: number, city: string, requestedCat: string, page: number,
  radius: number, count: number, unsplashKey?: string, pexelsKey?: string
): Promise<{ posts: ApiPost[]; hasMore: boolean }> {
  // 'food' rides on the restaurants query but keeps its own category label
  const osmCat = requestedCat === 'food' ? 'restaurants' : requestedCat;
  const radiusM = Math.min(radius * 1000, 12000);
  const elements = await fetchOverpassPlaces(lat, lng, osmCat, radiusM);
  const pageEls = elements.slice(page * count, page * count + count);
  if (pageEls.length === 0) return { posts: [], hasMore: false };

  // Descriptions are written for free from each place's own OSM tags inside
  // overpassToPost (no LLM, no credits) — we pass '' so it self-describes. We try
  // the venue's REAL photo (og:image, free; Google Places, budget-capped) for
  // most of the page now — OSM's own image/wikimedia tag is used for all,
  // instantly and free. More real venue photos, cost still bounded.
  const posts = await Promise.all(
    pageEls.map((el, i) => overpassToPost(
      el, city, requestedCat, '', unsplashKey, pexelsKey, /* tryRealPhoto */ i < 10
    ))
  );
  return { posts, hasMore: (page + 1) * count < elements.length };
}

async function wikipediaPosts(
  lat: number, lng: number, city: string, page: number, radius: number, count: number,
  claudeKey?: string, unsplashKey?: string, pexelsKey?: string
): Promise<{ posts: ApiPost[]; hasMore: boolean }> {
  // Each ~50-result search serves 3 pages; deeper pages shift the search
  // centre outward in a ring so sightseeing never runs dry
  const PAGES_PER_RING = 3;
  const ring = Math.floor(page / PAGES_PER_RING);
  const offset = (page % PAGES_PER_RING) * count;

  const radiusM = Math.min(radius * 1000, 10000);
  const nearby = await fetchWikipediaNearby(lat, lng, radiusM, ring, city);
  const pagePOIs = nearby.slice(offset, offset + count);
  if (pagePOIs.length === 0) return { posts: [], hasMore: ring < 8 };

  const rawSummaries = await Promise.all(pagePOIs.map(p => fetchWikipediaSummary(p.title)));
  // Drop articles that are really about a neighbouring village/town (their own
  // summary says "municipality/village in…") — not sights. Reliable signal that
  // the bare title can't give us.
  const kept = pagePOIs
    .map((poi, i) => ({ poi, summary: rawSummaries[i] }))
    .filter(({ summary }) => !isSettlementArticle(summary?.description));
  if (kept.length === 0) return { posts: [], hasMore: offset + count < nearby.length || ring < 8 };

  const keptPOIs   = kept.map(k => k.poi);
  const summaries  = kept.map(k => k.summary);
  const poiData = keptPOIs.map((p, i) => ({
    name: p.title,
    extract: summaries[i]?.extract ?? `${p.title} is a landmark near ${city}.`,
  }));
  const fallbackDescs = poiData.map(p => p.extract.slice(0, 300));
  const descriptions = claudeKey
    ? await enrichSightseeingDescriptions(poiData, city, claudeKey).catch(() => fallbackDescs)
    : fallbackDescs;

  const posts = await Promise.all(keptPOIs.map((poi, i) =>
    wikiToPost(poi, summaries[i], descriptions[i] ?? fallbackDescs[i], city, unsplashKey, pexelsKey)
  ));
  return { posts, hasMore: offset + count < nearby.length || ring < 8 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranking: upcoming events soonest-first (near beats far on the same day),
// places nearest-first, then interleave so the feed mixes events and places.
// ─────────────────────────────────────────────────────────────────────────────

function rankAndMix(posts: ApiPost[], count: number): ApiPost[] {
  const events = posts.filter(p => p.isEvent)
    .sort((a, b) => {
      const da = a.eventDateRaw ?? '9999';
      const db = b.eventDateRaw ?? '9999';
      if (da !== db) return da < db ? -1 : 1;
      return (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999);
    });
  const places = posts.filter(p => !p.isEvent)
    .sort((a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999));

  const mixed: ApiPost[] = [];
  let e = 0, pl = 0;
  while (mixed.length < count && (e < events.length || pl < places.length)) {
    // 3 events, then 1 place
    for (let k = 0; k < 3 && e < events.length && mixed.length < count; k++) mixed.push(events[e++]);
    if (pl < places.length && mixed.length < count) mixed.push(places[pl++]);
    if (e >= events.length) while (pl < places.length && mixed.length < count) mixed.push(places[pl++]);
  }
  return mixed;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/feed — one request, every relevant source, deduped + ranked
// ─────────────────────────────────────────────────────────────────────────────

// ── Caching wrapper (#1 ingestion pipeline) ───────────────────────────────────
// Serves from the Redis ingestion cache when warm; on a miss, computes live and
// stores the result so the next users (and the cron warmer) are instant. The
// expensive Ticketmaster/Claude/Overpass work runs once per area+category, not
// once per user. No-ops transparently when Upstash isn't configured.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const noStore = searchParams.get('fresh') === '1';

  const rawCatKey = searchParams.get('category') ?? 'events';
  const key = eventsCacheKey({
    category: VALID_CATEGORIES.has(rawCatKey) ? rawCatKey : 'events',
    city:   (searchParams.get('city') || '').slice(0, 60),
    lat:    parseFloat(searchParams.get('lat') || '0'),
    lng:    parseFloat(searchParams.get('lng') || '0'),
    page:   parseInt(searchParams.get('page') || '0', 10),
    radius: parseInt(searchParams.get('radius') || '25', 10),
    source: 'feed',
  });

  if (!noStore) {
    const cached = await cacheGet<{ posts: unknown[] }>(key);
    if (cached && Array.isArray(cached.posts) && cached.posts.length > 0) {
      return NextResponse.json(cached, { headers: { 'Cache-Control': 'no-store', 'x-nova-cache': 'HIT' } });
    }

    // ── DB-first: serve from our OWN events DB when it has coverage here ──────
    // Falls through to the live-API compute below if the DB is empty/unconfigured.
    if (dbReadEnabled) {
      try {
        const cat    = VALID_CATEGORIES.has(rawCatKey) ? rawCatKey : 'events';
        const lat    = parseFloat(searchParams.get('lat') || '0');
        const lng    = parseFloat(searchParams.get('lng') || '0');
        const radius = Math.max(1, Math.min(200, parseInt(searchParams.get('radius') || '25', 10)));
        const count  = Math.max(1, Math.min(20, parseInt(searchParams.get('count') || '8', 10)));
        const page   = Math.max(0, parseInt(searchParams.get('page') || '0', 10));
        if (lat || lng) {
          let dbPosts = await queryEventsNear({
            lat, lng, radiusKm: radius, category: cat,
            afterIso: new Date().toISOString(), limit: count, offset: page * count,
          });
          // Sightseeing must be worth seeing — drop any train-station / infra
          // rows ingested by older sweeps so they never lead the feed again.
          if (cat === 'sightseeing') {
            const cityName = searchParams.get('city') || '';
            dbPosts = dbPosts.filter(p => isWorthSightseeing(
              p.organizer || p.user?.name || p.location?.name || '', cityName
            ));
          }
          // For PLACE categories (shops/venues/restaurants/hotels/rentals/food/
          // sightseeing) the live OSM/Wikipedia sources are authoritative and
          // strictly local. Only serve them from the DB when the DB actually has
          // LOCAL coverage — otherwise a small town (Baden) would get a bigger
          // neighbour's places (Wiener Neustadt) from the DB and never fall
          // through to the live data that has its own. Events legitimately come
          // from farther away, so they keep the simple count gate.
          const isPlaceCat = OSM_CATEGORIES.has(cat) || cat === 'food' || cat === 'sightseeing';
          const nearestKm = dbPosts.length
            ? Math.min(...dbPosts.map(p => haversineKm(lat, lng, p.location?.lat ?? 0, p.location?.lng ?? 0)))
            : Infinity;
          const dbIsLocalEnough = !isPlaceCat || nearestKm <= 12;

          if (dbPosts.length >= 4 && dbIsLocalEnough) {
            const payload = {
              // Stamp the user-relative distance so the client can split a small
              // town's own events from a bigger neighbour's (stored distanceKm is
              // relative to the ingest centroid, not this user). ensureUniqueImages
              // guarantees no two cards share a photo.
              posts: ensureUniqueImages(withDistance(dbPosts, lat, lng)),
              city: searchParams.get('city') || '',
              country: searchParams.get('country') || '',
              sources: ['db'], hasMore: dbPosts.length >= count,
            };
            await cacheSet(key, payload, cacheTtl('feed', rawCatKey));
            return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store', 'x-nova-cache': 'DB' } });
          }
        }
      } catch { /* DB read failed — fall back to live */ }
    }
  }

  const res = await computeFeed(request);
  try {
    const payload = await res.clone().json() as { posts?: unknown[] };
    if (Array.isArray(payload.posts) && payload.posts.length > 0) {
      await cacheSet(key, payload, cacheTtl('feed', rawCatKey));
    }
  } catch { /* skip caching non-JSON */ }
  return res;
}

async function computeFeed(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const cityParam    = (searchParams.get('city')    ?? '').slice(0, 100).replace(/[<>'"\\]/g, '');
  const countryParam = (searchParams.get('country') ?? '').slice(0, 100).replace(/[<>'"\\]/g, '');
  const page    = Math.max(0, Math.min(30, parseInt(searchParams.get('page')   || '0',  10)));
  const radius  = Math.max(1, Math.min(200, parseInt(searchParams.get('radius') || '25', 10)));
  const count   = Math.max(1, Math.min(20, parseInt(searchParams.get('count')  || '8',  10)));
  const days    = Math.max(7, Math.min(180, parseInt(searchParams.get('days')  || '60', 10)));
  const rawCat  = searchParams.get('category') ?? 'events';
  const category = VALID_CATEGORIES.has(rawCat) ? rawCat : 'events';

  // Explicit coords → IP geolocation (free Vercel headers) → Vienna default;
  // plus the city guard so posts are never labelled "Unknown City"
  const { lat, lng, city, country } = await resolveRequestGeo(
    request.headers, searchParams.get('lat'), searchParams.get('lng'), cityParam, countryParam
  );

  const tmKey       = process.env.TICKETMASTER_API_KEY;
  const sgKey       = process.env.SEATGEEK_CLIENT_ID;
  const claudeKey   = process.env.ANTHROPIC_API_KEY;
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  const pexelsKey   = process.env.PEXELS_API_KEY;

  // ── Pure place categories: OSM is the single source ───────────────────────
  if (OSM_CATEGORIES.has(category)) {
    try {
      const { posts, hasMore } = await osmPosts(lat, lng, city, category, page, radius, count, unsplashKey, pexelsKey);
      if (posts.length > 0) {
        const final = ensureUniqueImages(withDistance(posts, lat, lng));
        return NextResponse.json(
          { posts: final, city, country, sources: ['osm'], hasMore },
          { headers: PLACE_CACHE }
        );
      }
      // Deep pages legitimately run dry — that's the end of the list
      if (page > 0) {
        return NextResponse.json({ posts: [], city, country, sources: ['osm'], hasMore: false }, { headers: PLACE_CACHE });
      }
      // Page 0 empty → fall through to AI search / fallback below
    } catch (err) {
      console.error('[feed/osm]', err);
      // Overpass down → fall through so the feed is never blank
    }
  }

  // ── Everything else: fan out to all relevant sources in parallel ──────────
  const tasks: Promise<{ source: string; posts: ApiPost[]; hasMore: boolean }>[] = [];

  if (tmKey && TM_CATEGORY_MAP[category]) {
    tasks.push(
      ticketmasterPosts(lat, lng, city, category, page, radius, count, days, tmKey, claudeKey)
        .then(r => ({ source: 'ticketmaster', ...r }))
        .catch(err => { console.error('[feed/tm]', err); return { source: 'ticketmaster', posts: [], hasMore: false }; })
    );
  }

  if (EB_CATEGORIES.has(category)) {
    tasks.push(
      fetchEventbriteEvents(city, country, lat, lng, count, category, page)
        .then(posts => ({ source: 'eventbrite', posts, hasMore: posts.length >= count }))
        .catch(err => { console.error('[feed/eb]', err); return { source: 'eventbrite', posts: [], hasMore: false }; })
    );
  }

  if (sgKey && SG_CATEGORIES.has(category)) {
    tasks.push(
      fetchSeatGeekEvents(lat, lng, category, page, radius, count, sgKey, city)
        .then(posts => ({ source: 'seatgeek', posts, hasMore: posts.length >= count }))
        .catch(err => { console.error('[feed/sg]', err); return { source: 'seatgeek', posts: [], hasMore: false }; })
    );
  }

  if (category === 'sightseeing') {
    tasks.push(
      wikipediaPosts(lat, lng, city, page, radius, count, claudeKey, unsplashKey, pexelsKey)
        .then(r => ({ source: 'wikipedia', ...r }))
        .catch(err => { console.error('[feed/wiki]', err); return { source: 'wikipedia', posts: [], hasMore: false }; })
    );
  }

  if (category === 'food') {
    tasks.push(
      osmPosts(lat, lng, city, 'food', page, radius, count, unsplashKey, pexelsKey)
        .then(r => ({ source: 'osm', ...r }))
        .catch(err => { console.error('[feed/food-osm]', err); return { source: 'osm', posts: [], hasMore: false }; })
    );
  }

  // Blend real OSM places into the mixed categories so they're rich and free
  // everywhere — even a tiny town's "art" / "community" / "music" / "sport" tab
  // fills with its actual museums, churches, clubs, gyms, pitches and markets.
  if (OSM_BLEND_CATEGORIES.has(category)) {
    tasks.push(
      osmPosts(lat, lng, city, category, page, radius, count, unsplashKey, pexelsKey)
        .then(r => ({ source: 'osm', ...r }))
        .catch(err => { console.error('[feed/osm-blend]', err); return { source: 'osm', posts: [], hasMore: false }; })
    );
  }

  const results = await Promise.all(tasks);
  let pool = dropExpired(dedupePosts(results.flatMap(r => r.posts)));
  const sources = results.filter(r => r.posts.length > 0).map(r => r.source);
  let anyMore = results.some(r => r.hasMore);

  const sparseThreshold = Math.max(3, Math.floor(count / 2));

  // ── Nova AI crawler (FREE) — read real events off the web ourselves ───────
  // Our OWN web-reading engine: it fetches public event pages and extracts real
  // events from their schema.org JSON-LD. No key, no per-call credits. Runs
  // first whenever the keyed sources are sparse, so most "empty" feeds get
  // filled for free before we ever consider the paid LLM path below.
  if (pool.length < sparseThreshold && category !== 'sightseeing') {
    try {
      const crawled = await crawlCityEvents({ city, country, lat, lng, category, count, page });
      if (crawled.length > 0) {
        pool = dropExpired(dedupePosts([...pool, ...crawled]));
        sources.push('nova_ai');
        anyMore = anyMore || page < 6;
      }
    } catch (err) {
      console.error('[feed/novaAI]', err);
    }
  }

  // ── AI web search only when the free sources came up nearly empty ─────────
  // (saves credits AND latency — it's the slowest source by far). Also gated by
  // a soft daily spend cap (AI_DAILY_BUDGET) so a traffic spike or a big
  // ingestion sweep can't run up an unbounded Anthropic bill.
  if (pool.length < sparseThreshold && claudeKey && !(await aiBudgetExceeded())) {
    try {
      await noteAiCall();
      const aiPosts = await searchRealEventsWithClaude(
        city, country, todayStr(), count, page, category, claudeKey, unsplashKey, pexelsKey, lat, lng
      );
      if (aiPosts.length > 0) {
        pool = dropExpired(dedupePosts([...pool, ...aiPosts]));
        sources.push('ai_search');
        anyMore = anyMore || page < 8;
      }
    } catch (err) {
      console.error('[feed/ai]', err);
    }
  }

  // No invented events: if every real source is empty, return an honest empty
  // page — the client shows a clear "no events found" state instead
  let final = rankAndMix(withDistance(pool, lat, lng), count * 2);

  // Cold-start cushion: tiny towns can have nothing within radius even after
  // expansion. Rather than a dead feed, fall back to upcoming events anywhere in
  // the same country (from our DB). Honest — still real events, just farther out.
  if (final.length === 0 && dbReadEnabled && country) {
    try {
      const countryPosts = await queryEventsByCountry({ country, category, limit: count, offset: page * count });
      if (countryPosts.length > 0) {
        final = withDistance(countryPosts, lat, lng);
        sources.push('db_country');
        anyMore = anyMore || countryPosts.length >= count;
      }
    } catch { /* fall back to empty */ }
  }

  return NextResponse.json(
    {
      posts: ensureUniqueImages(final),
      city, country, sources,
      hasMore: anyMore || final.length >= count,
      page,
    },
    { headers: final.length > 0 ? EVENT_CACHE : { 'Cache-Control': 'no-store' } }
  );
}
