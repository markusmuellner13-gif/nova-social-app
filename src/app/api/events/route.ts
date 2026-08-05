import { NextRequest, NextResponse } from 'next/server';
import { todayStr } from '@/lib/sources/shared';
import { finalizePhotos } from '@/lib/sources/venuePhoto';
import { resolveRequestGeo } from '@/lib/sources/geocode';
import { fetchTicketmaster, tmEventToPost, TM_CATEGORY_MAP } from '@/lib/sources/ticketmaster';
import { fetchEventbriteEvents } from '@/lib/sources/eventbrite';
import { fetchOverpassPlaces, overpassToPost } from '@/lib/sources/osm';
import { fetchWikipediaNearby, fetchWikipediaSummary, wikiToPost } from '@/lib/sources/wikipedia';
import {
  enrichEventDescriptions, enrichPlaceDescriptions, enrichSightseeingDescriptions,
  searchRealEventsWithClaude,
} from '@/lib/sources/claudeAI';

export const maxDuration = 60; // Vercel Pro: allow up to 60s for web-search API calls

// Cache headers — events/community: short edge cache; places: 1h client / 24h CDN
const NO_CACHE    = { 'Cache-Control': 'no-store, max-age=0' };
const EVENT_CACHE = { 'Cache-Control': 'public, s-maxage=240, stale-while-revalidate=900' };
const PLACE_CACHE = { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600' };
const WIKI_CACHE  = { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' };

// Valid categories — prevents injection via query params
const VALID_CATEGORIES = new Set([
  'events','music','sports','art','fitness','food',
  'sightseeing','lifestyle','discover','shops','venues','community',
  'restaurants','hotels','rentals','travel','tech','pets','fashion','outdoors',
]);

// Categories served by OpenStreetMap Overpass (real local places)
const OSM_CATEGORIES = new Set(['shops','venues','restaurants','hotels','rentals','outdoors']);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Sanitize all inputs — prevents injection via URL params
  const cityParam    = (searchParams.get('city')    ?? '').slice(0, 100).replace(/[<>'"\\]/g, '');
  const countryParam = (searchParams.get('country') ?? '').slice(0, 100).replace(/[<>'"\\]/g, '');
  const page    = Math.max(0, Math.min(20, parseInt(searchParams.get('page')   || '0',  10)));
  const radius  = Math.max(1, Math.min(200, parseInt(searchParams.get('radius') || '25', 10)));
  const count   = Math.max(1, Math.min(20, parseInt(searchParams.get('count')  || '8',  10)));
  const rawCat  = searchParams.get('category') ?? 'events';
  const category = VALID_CATEGORIES.has(rawCat) ? rawCat : 'events';
  const source  = searchParams.get('source') ?? '';

  // Explicit coords → IP geolocation → Vienna default; city guard ensures no
  // post is ever labelled "Unknown City"
  const { lat, lng, city, country } = await resolveRequestGeo(
    request.headers, searchParams.get('lat'), searchParams.get('lng'), cityParam, countryParam
  );

  const tmKey       = process.env.TICKETMASTER_API_KEY;
  const claudeKey   = process.env.ANTHROPIC_API_KEY;
  const today       = todayStr();

  // ── TOURISM: events promoted on the city's official tourism websites ──────
  // (festivals, markets, seasonal celebrations missing from ticket platforms)
  if (source === 'tourism') {
    if (claudeKey) {
      try {
        const posts = await searchRealEventsWithClaude(
          city, country, today, count, page, 'events', claudeKey,
          lat, lng, /* tourismFocus */ true
        );
        if (posts.length > 0) {
          return NextResponse.json({ posts: await finalizePhotos(posts), city, country, source: 'tourism', hasMore: page < 4 }, { headers: NO_CACHE });
        }
      } catch (err) {
        console.error('[events/tourism]', err);
      }
    }
    // Free fallback — structured event data scraped from Eventbrite city pages
    try {
      const posts = await fetchEventbriteEvents(city, country, lat, lng, count, 'events', page);
      if (posts.length > 0) {
        return NextResponse.json({ posts: await finalizePhotos(posts), city, country, source: 'eventbrite', hasMore: false }, { headers: PLACE_CACHE });
      }
    } catch (err) {
      console.error('[events/tourism/eventbrite]', err);
    }
    return NextResponse.json({ posts: [], city, country, source: 'tourism', hasMore: false }, { headers: NO_CACHE });
  }

  // ── OSM PLACES: shops / venues / restaurants / hotels / rentals ───────────
  if (OSM_CATEGORIES.has(category)) {
    try {
      const radiusM = Math.min(radius * 1000, 10000);
      const elements = await fetchOverpassPlaces(lat, lng, category, radiusM);

      if (elements.length === 0) throw new Error('No OSM places found nearby');

      const pageEls = elements.slice(page * count, page * count + count);
      if (pageEls.length === 0) {
        return NextResponse.json({ posts: [], city, country, source: 'osm', hasMore: false }, { headers: PLACE_CACHE });
      }

      const placeData = pageEls.map(el => ({
        name: el.tags?.name ?? 'Unknown',
        type: el.tags?.shop ?? el.tags?.amenity ?? el.tags?.leisure ?? category,
        address: [el.tags?.['addr:street'], el.tags?.['addr:housenumber']].filter(Boolean).join(' '),
      }));

      const descriptions = claudeKey
        ? await enrichPlaceDescriptions(placeData, city, category, claudeKey)
            .catch(() => placeData.map(p => `${p.name} is a popular ${p.type} in ${city}.`))
        : placeData.map(p => `${p.name} is a popular ${p.type} in ${city}.`);

      const posts = await Promise.all(
        pageEls.map((el, i) => overpassToPost(el, city, category, descriptions[i] ?? '', /* tryRealPhoto */ true))
      );

      const hasMore = (page + 1) * count < elements.length;
      return NextResponse.json({ posts: await finalizePhotos(posts), city, country, source: 'osm', hasMore }, { headers: PLACE_CACHE });
    } catch (err) {
      console.error('[events/overpass]', err);
      // Fall through to Claude web search as fallback
    }
  }

  // ── COMMUNITY: Claude web search for real local gatherings/meetups ─────────
  if (category === 'community') {
    if (claudeKey) {
      try {
        const posts = await searchRealEventsWithClaude(city, country, today, count, page, 'community', claudeKey, lat, lng);
        if (posts.length > 0) {
          return NextResponse.json({ posts: await finalizePhotos(posts), city, country, source: 'web_search', hasMore: page < 8 }, { headers: NO_CACHE });
        }
      } catch (err) {
        console.error('[events/community]', err);
      }
    }
    try {
      const ebPosts = await fetchEventbriteEvents(city, country, lat, lng, count, 'community', page);
      if (ebPosts.length > 0) {
        return NextResponse.json({ posts: await finalizePhotos(ebPosts), city, country, source: 'eventbrite', hasMore: ebPosts.length >= count }, { headers: PLACE_CACHE });
      }
    } catch (err) {
      console.error('[events/community/eventbrite]', err);
    }
    return NextResponse.json({ posts: [], city, country, source: 'none', hasMore: false }, { headers: NO_CACHE });
  }

  // ── SIGHTSEEING: Wikipedia GeoSearch + Summary API (free, real photos) ────
  if (category === 'sightseeing') {
    try {
      const radiusM = Math.min(radius * 1000, 10000);
      const nearby = await fetchWikipediaNearby(lat, lng, radiusM);

      if (nearby.length === 0) throw new Error('No Wikipedia articles nearby');

      const pagePOIs = nearby.slice(page * count, page * count + count);
      if (pagePOIs.length === 0) {
        return NextResponse.json({ posts: [], city, country, source: 'wikipedia', hasMore: false }, { headers: WIKI_CACHE });
      }

      const summaries = await Promise.all(pagePOIs.map(p => fetchWikipediaSummary(p.title)));

      const poiData = pagePOIs.map((p, i) => ({
        name: p.title,
        extract: summaries[i]?.extract ?? `${p.title} is a landmark near ${city}.`,
      }));

      const descriptions = claudeKey
        ? await enrichSightseeingDescriptions(poiData, city, claudeKey)
            .catch(() => poiData.map(p => p.extract.slice(0, 300)))
        : poiData.map(p => p.extract.slice(0, 300));

      const posts = await Promise.all(pagePOIs.map((poi, i) =>
        wikiToPost(poi, summaries[i], descriptions[i] ?? poiData[i].extract.slice(0, 300), city)
      ));

      const hasMore = (page + 1) * count < nearby.length;
      return NextResponse.json({ posts: await finalizePhotos(posts), city, country, source: 'wikipedia', hasMore }, { headers: WIKI_CACHE });
    } catch (err) {
      console.error('[events/sightseeing/wikipedia]', err);
      // Fall through to Claude for sightseeing
    }
  }

  // ── EVENTS / SPORTS / MUSIC: Ticketmaster + Claude running in parallel ──────
  if (category !== 'sightseeing') {
    // Fire Claude immediately (don't wait for TM to finish first)
    const claudePromise = claudeKey
      ? searchRealEventsWithClaude(city, country, today, count, page, category, claudeKey, lat, lng).catch(() => null)
      : Promise.resolve(null);

    if (tmKey && TM_CATEGORY_MAP[category]) {
      try {
        // Smart radius: expand server-side when the local area is sparse
        let { events: tmEvents, totalPages } = await fetchTicketmaster(lat, lng, category, page, radius, tmKey);
        if (tmEvents.length < 4 && radius <= 25) {
          const expanded = await fetchTicketmaster(lat, lng, category, page, 75, tmKey).catch(() => ({ events: [], totalPages: 0 }));
          if (expanded.events.length > tmEvents.length) { tmEvents = expanded.events; totalPages = expanded.totalPages; }
        }
        if (tmEvents.length < 4 && radius <= 75) {
          const expanded = await fetchTicketmaster(lat, lng, category, page, 150, tmKey).catch(() => ({ events: [], totalPages: 0 }));
          if (expanded.events.length > tmEvents.length) { tmEvents = expanded.events; totalPages = expanded.totalPages; }
        }

        if (tmEvents.length > 0) {
          const enrichInput = tmEvents.map(ev => ({
            name: ev.name,
            venue: ev._embedded?.venues?.[0]?.name ?? city,
            date: ev.dates?.start?.localDate ?? today,
            time: ev.dates?.start?.localTime?.slice(0, 5) ?? '',
            genre: ev.classifications?.[0]?.genre?.name ?? ev.classifications?.[0]?.segment?.name ?? 'Event',
            price: ev.priceRanges?.[0]
              ? `${ev.priceRanges[0].currency} ${ev.priceRanges[0].min.toFixed(0)}–${ev.priceRanges[0].max.toFixed(0)}`
              : 'See website',
          }));

          const descriptions = claudeKey
            ? await enrichEventDescriptions(enrichInput, city, claudeKey)
                .catch(() => tmEvents.map(ev => `${ev.name} at ${ev._embedded?.venues?.[0]?.name ?? city}.`))
            : tmEvents.map(ev => `${ev.name} at ${ev._embedded?.venues?.[0]?.name ?? city}.`);

          const posts = tmEvents.map((ev, i) => tmEventToPost(ev, descriptions[i] ?? '', city));
          return NextResponse.json({ posts: await finalizePhotos(posts), city, country, source: 'ticketmaster', hasMore: page < totalPages - 1, totalPages }, { headers: EVENT_CACHE });
        }
      } catch (err) {
        console.error('[events/ticketmaster]', err);
      }
    }

    // No TM results — use the Claude generation that was already running
    const claudePosts = await claudePromise;
    if (claudePosts && claudePosts.length > 0) {
      return NextResponse.json({ posts: await finalizePhotos(claudePosts), city, country, source: 'claude', hasMore: page < 10 }, { headers: NO_CACHE });
    }

    // FOOD free fallback — real local restaurants/cafés/bars from OpenStreetMap
    // (no API key, no AI credits) instead of generic event filler
    if (category === 'food') {
      try {
        const radiusM = Math.min(radius * 1000, 10000);
        const elements = await fetchOverpassPlaces(lat, lng, 'restaurants', radiusM);
        const pageEls = elements.slice(page * count, page * count + count);
        if (pageEls.length > 0) {
          const placeData = pageEls.map(el => ({
            name: el.tags?.name ?? 'Unknown',
            type: el.tags?.amenity ?? 'restaurant',
            address: [el.tags?.['addr:street'], el.tags?.['addr:housenumber']].filter(Boolean).join(' '),
          }));
          const descriptions = claudeKey
            ? await enrichPlaceDescriptions(placeData, city, 'food', claudeKey)
                .catch(() => placeData.map(p => `${p.name} is a popular ${p.type} in ${city}.`))
            : placeData.map(p => `${p.name} is a popular ${p.type} in ${city}.`);

          const posts = await Promise.all(
            pageEls.map((el, i) => overpassToPost(el, city, 'food', descriptions[i] ?? '', /* tryRealPhoto */ true))
          );

          const hasMore = (page + 1) * count < elements.length;
          return NextResponse.json({ posts: await finalizePhotos(posts), city, country, source: 'osm', hasMore }, { headers: PLACE_CACHE });
        }
      } catch (err) {
        console.error('[events/food/osm]', err);
      }
    }
  }

  // ── SIGHTSEEING Claude fallback (if Wikipedia failed above) ───────────────
  if (category === 'sightseeing' && claudeKey) {
    try {
      const posts = await searchRealEventsWithClaude(city, country, today, count, page, category, claudeKey, lat, lng);
      if (posts.length > 0) {
        return NextResponse.json({ posts: await finalizePhotos(posts), city, country, source: 'claude', hasMore: page < 10 }, { headers: NO_CACHE });
      }
    } catch (err) {
      console.error('[events/sightseeing/claude]', err);
    }
  }

  // ── FREE FALLBACK: real events from Eventbrite city pages (no keys/credits)
  try {
    const ebPosts = await fetchEventbriteEvents(city, country, lat, lng, count, category, page);
    if (ebPosts.length > 0) {
      return NextResponse.json({ posts: await finalizePhotos(ebPosts), city, country, source: 'eventbrite', hasMore: ebPosts.length >= count }, { headers: PLACE_CACHE });
    }
  } catch (err) {
    console.error('[events/eventbrite]', err);
  }

  // No invented events: when every real source is empty, say so honestly
  return NextResponse.json({
    posts: [],
    city, country, source: 'none', hasMore: false,
  }, { headers: NO_CACHE });
}
