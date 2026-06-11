import { NextRequest, NextResponse } from 'next/server';
import { ApiPost, dedupePosts, dropExpired, withDistance, todayStr } from '@/lib/sources/shared';
import { resolveRequestGeo } from '@/lib/sources/geocode';
import { fetchTicketmaster, tmEventToPost, TM_CATEGORY_MAP } from '@/lib/sources/ticketmaster';
import { fetchEventbriteEvents } from '@/lib/sources/eventbrite';
import { fetchOverpassPlaces, overpassToPost } from '@/lib/sources/osm';
import { fetchWikipediaNearby, fetchWikipediaSummary, wikiToPost } from '@/lib/sources/wikipedia';
import { fetchSeatGeekEvents } from '@/lib/sources/seatgeek';
import {
  enrichEventDescriptions, enrichPlaceDescriptions, enrichSightseeingDescriptions,
  searchRealEventsWithClaude,
} from '@/lib/sources/claudeAI';

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

// Categories served purely by OpenStreetMap places
const OSM_CATEGORIES = new Set(['shops','venues','restaurants','hotels','rentals']);

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
  radius: number, count: number, claudeKey?: string, unsplashKey?: string, pexelsKey?: string
): Promise<{ posts: ApiPost[]; hasMore: boolean }> {
  // 'food' rides on the restaurants query but keeps its own category label
  const osmCat = requestedCat === 'food' ? 'restaurants' : requestedCat;
  const radiusM = Math.min(radius * 1000, 10000);
  const elements = await fetchOverpassPlaces(lat, lng, osmCat, radiusM);
  const pageEls = elements.slice(page * count, page * count + count);
  if (pageEls.length === 0) return { posts: [], hasMore: false };

  const placeData = pageEls.map(el => ({
    name: el.tags?.name ?? 'Unknown',
    type: el.tags?.shop ?? el.tags?.amenity ?? el.tags?.leisure ?? osmCat,
    address: [el.tags?.['addr:street'], el.tags?.['addr:housenumber']].filter(Boolean).join(' '),
  }));
  const fallbackDescs = placeData.map(p => `${p.name} is a popular ${p.type} in ${city}.`);
  const descriptions = claudeKey
    ? await enrichPlaceDescriptions(placeData, city, requestedCat, claudeKey).catch(() => fallbackDescs)
    : fallbackDescs;

  // Try the venue's real og:image for the first few posts per page
  const posts = await Promise.all(
    pageEls.map((el, i) => overpassToPost(
      el, city, requestedCat, descriptions[i] ?? '', unsplashKey, pexelsKey, /* tryOgImage */ i < 4
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
  const nearby = await fetchWikipediaNearby(lat, lng, radiusM, ring);
  const pagePOIs = nearby.slice(offset, offset + count);
  if (pagePOIs.length === 0) return { posts: [], hasMore: ring < 8 };

  const summaries = await Promise.all(pagePOIs.map(p => fetchWikipediaSummary(p.title)));
  const poiData = pagePOIs.map((p, i) => ({
    name: p.title,
    extract: summaries[i]?.extract ?? `${p.title} is a landmark near ${city}.`,
  }));
  const fallbackDescs = poiData.map(p => p.extract.slice(0, 300));
  const descriptions = claudeKey
    ? await enrichSightseeingDescriptions(poiData, city, claudeKey).catch(() => fallbackDescs)
    : fallbackDescs;

  const posts = await Promise.all(pagePOIs.map((poi, i) =>
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

export async function GET(request: NextRequest) {
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
      const { posts, hasMore } = await osmPosts(lat, lng, city, category, page, radius, count, claudeKey, unsplashKey, pexelsKey);
      if (posts.length > 0) {
        const final = withDistance(posts, lat, lng);
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
      osmPosts(lat, lng, city, 'food', page, radius, count, claudeKey, unsplashKey, pexelsKey)
        .then(r => ({ source: 'osm', ...r }))
        .catch(err => { console.error('[feed/food-osm]', err); return { source: 'osm', posts: [], hasMore: false }; })
    );
  }

  const results = await Promise.all(tasks);
  let pool = dropExpired(dedupePosts(results.flatMap(r => r.posts)));
  const sources = results.filter(r => r.posts.length > 0).map(r => r.source);
  let anyMore = results.some(r => r.hasMore);

  // ── AI web search only when the free sources came up nearly empty ─────────
  // (saves credits AND latency — it's the slowest source by far)
  if (pool.length < Math.max(3, Math.floor(count / 2)) && claudeKey) {
    try {
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
  const final = rankAndMix(withDistance(pool, lat, lng), count * 2);

  return NextResponse.json(
    {
      posts: final,
      city, country, sources,
      hasMore: anyMore || final.length >= count,
      page,
    },
    { headers: final.length > 0 ? EVENT_CACHE : { 'Cache-Control': 'no-store' } }
  );
}
