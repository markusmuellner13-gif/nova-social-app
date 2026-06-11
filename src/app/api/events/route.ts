import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60; // Vercel Pro: allow up to 60s for web-search API calls

// Cache headers — events/community: no cache (live data); places: 1h client / 24h CDN
const NO_CACHE    = { 'Cache-Control': 'no-store, max-age=0' };
const PLACE_CACHE = { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600' };
const WIKI_CACHE  = { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' };

// Valid categories — prevents injection via query params
const VALID_CATEGORIES = new Set([
  'events','music','sports','art','fitness','food',
  'sightseeing','lifestyle','discover','shops','venues','community',
  'restaurants','hotels','rentals','travel','tech','pets','fashion',
]);

// Categories served by OpenStreetMap Overpass (real local places)
const OSM_CATEGORIES = new Set(['shops','venues','restaurants','hotels','rentals']);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface TmImage { url: string; width: number; height: number; ratio?: string; fallback?: boolean }
interface TmEvent {
  id: string;
  name: string;
  url: string;
  images: TmImage[];
  dates: { start: { localDate?: string; localTime?: string } };
  priceRanges?: { min: number; max: number; currency: string }[];
  classifications?: { segment?: { name: string }; genre?: { name: string } }[];
  _embedded?: {
    venues?: {
      name: string;
      address?: { line1?: string };
      city?: { name: string };
      location?: { latitude?: string; longitude?: string };
    }[];
  };
}

interface WikiGeoResult {
  pageid: number;
  title: string;
  lat: number;
  lon: number;
  dist: number;
}

interface WikiSummary {
  title: string;
  description?: string;
  extract?: string;
  thumbnail?: { source: string };
  content_urls?: { desktop?: { page?: string } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function fallbackAvatar(name: string) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const colors = ['8b5cf6', 'ec4899', '3b82f6', 'f97316', '22c55e', 'f43f5e', 'a855f7', '06b6d4'];
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${colors[name.charCodeAt(0) % colors.length]}&color=fff&size=80&bold=true`;
}

function logoUrl(domain: string) { return `https://logo.clearbit.com/${domain}`; }

function makeUser(name: string, domain?: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '.').slice(0, 30);
  return {
    id: `org_${slug}`,
    name,
    username: slug,
    avatar: domain ? logoUrl(domain) : fallbackAvatar(name),
    bio: `Official Nova partner — ${name}`,
    followers: Math.floor(Math.random() * 5_000_000) + 10_000,
    following: 0,
    posts: Math.floor(Math.random() * 50_000) + 100,
    verified: true,
  };
}

function picsumUrl(seed: string) {
  return `https://picsum.photos/seed/${seed.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 32)}/600/750`;
}

// Route rate-limited image sources (Unsplash, Pexels, Wikipedia) through our
// CDN-cached proxy so repeated views are served from edge cache, not the origin API.
function proxyImage(url: string): string {
  if (!url) return url;
  if (
    url.includes('images.unsplash.com') ||
    url.includes('images.pexels.com')   ||
    url.includes('upload.wikimedia.org')
  ) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

function todayStr() { return new Date().toISOString().split('T')[0]; }

// ─────────────────────────────────────────────────────────────────────────────
// Image helpers — Unsplash → Pexels → picsum
// ─────────────────────────────────────────────────────────────────────────────

async function fetchUnsplashImage(query: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=portrait&content_filter=high`,
      { headers: { Authorization: `Client-ID ${key}` }, signal: AbortSignal.timeout(3500) }
    );
    if (!res.ok) return null;
    const d = await res.json() as { urls?: { raw?: string; regular?: string } };
    // Use raw URL with explicit crop dimensions for perfect 4:5 portrait framing
    const base = d.urls?.raw ?? d.urls?.regular;
    if (!base) return null;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}auto=format&fit=crop&w=600&h=750&q=80&crop=faces,entropy`;
  } catch { return null; }
}

async function fetchPexelsImage(query: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&orientation=portrait`,
      { headers: { Authorization: key }, signal: AbortSignal.timeout(3500) }
    );
    if (!res.ok) return null;
    const d = await res.json() as { photos?: { src?: { large2x?: string; large?: string } }[] };
    // Use large2x if available, then append crop params for perfect 4:5 framing
    const src = d.photos?.[0]?.src;
    const base = src?.large2x ?? src?.large;
    if (!base) return null;
    // Pexels supports ?w=&h=&fit=crop via their CDN
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}w=600&h=750&fit=crop`;
  } catch { return null; }
}

async function getImage(query: string, unsplashKey?: string, pexelsKey?: string, seed?: string): Promise<string> {
  if (unsplashKey) { const u = await fetchUnsplashImage(query, unsplashKey); if (u) return proxyImage(u); }
  if (pexelsKey)   { const u = await fetchPexelsImage(query, pexelsKey);     if (u) return proxyImage(u); }
  return picsumUrl(seed ?? query);
}

function bestTmImage(images: TmImage[]): string {
  if (!images?.length) return picsumUrl('event_placeholder');
  const real = images.filter(i => !i.fallback && i.url);
  const pool = real.length ? real : images;
  // Prefer true portrait ratios for 4:5 post frames; fallback to any image
  const PORTRAIT_RATIOS = new Set(['2_3', '3_4', '1_1', '4_3', '3_2']);
  const portrait = pool.filter(i => i.ratio && PORTRAIT_RATIOS.has(i.ratio));
  const source = portrait.length ? portrait : pool;
  const best = source.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
  // Ticketmaster CDN supports ?width=&height= resizing — request the exact post dimensions
  const url = best.url;
  if (url.includes('ticketmaster.com') || url.includes('livenation.com') || url.includes('ticketm.net')) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}width=600&height=750`;
  }
  return url;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wikipedia — real sightseeing POIs with real photos (free, no key)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchWikipediaNearby(lat: number, lng: number, radiusM: number): Promise<WikiGeoResult[]> {
  const r = Math.min(Math.max(radiusM, 1000), 10000); // Wikipedia max: 10000m
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=${r}&gslimit=50&format=json&origin=*`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Nova-App/2.0 (contact@nova-app.com)', 'Api-User-Agent': 'Nova-App/2.0 (contact@nova-app.com)' },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`Wikipedia GeoSearch ${res.status}`);
  const d = await res.json() as { query?: { geosearch?: WikiGeoResult[] } };
  return d.query?.geosearch ?? [];
}

async function fetchWikipediaSummary(title: string): Promise<WikiSummary | null> {
  try {
    const encoded = encodeURIComponent(title.replace(/ /g, '_'));
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
      {
        headers: { 'User-Agent': 'Nova-App/2.0 (contact@nova-app.com)', 'Api-User-Agent': 'Nova-App/2.0 (contact@nova-app.com)' },
        signal: AbortSignal.timeout(3000),
      }
    );
    if (!res.ok) return null;
    return await res.json() as WikiSummary;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Overpass (OpenStreetMap) — real shops, venues, community spaces (no API key)
// ─────────────────────────────────────────────────────────────────────────────

const OVERPASS_QUERIES: Record<string, string> = {
  shops: `[out:json][timeout:12];(
    node["shop"~"second_hand|vintage|charity|antiques|thrift"](around:RADIUS,LAT,LNG);
    way["shop"~"second_hand|vintage|charity|antiques|thrift"](around:RADIUS,LAT,LNG);
    node["shop"="clothes"]["second_hand"="yes"](around:RADIUS,LAT,LNG);
    node["shop"="books"]["second_hand"="yes"](around:RADIUS,LAT,LNG);
  );out body center;`,
  venues: `[out:json][timeout:12];(
    node["amenity"~"theatre|concert_hall|nightclub|music_venue|arts_centre|cinema|events_venue"](around:RADIUS,LAT,LNG);
    way["amenity"~"theatre|concert_hall|nightclub|music_venue|arts_centre|cinema|events_venue"](around:RADIUS,LAT,LNG);
    node["leisure"~"stadium|sports_hall|arena"](around:RADIUS,LAT,LNG);
    way["leisure"~"stadium|sports_hall|arena"](around:RADIUS,LAT,LNG);
  );out body center;`,
  restaurants: `[out:json][timeout:12];(
    node["amenity"~"restaurant|cafe|bar|biergarten|pub"]["name"](around:RADIUS,LAT,LNG);
    way["amenity"~"restaurant|cafe|bar|biergarten|pub"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,
  hotels: `[out:json][timeout:12];(
    node["tourism"~"hotel|guest_house|hostel|motel|apartment|chalet"]["name"](around:RADIUS,LAT,LNG);
    way["tourism"~"hotel|guest_house|hostel|motel|apartment|chalet"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,
  rentals: `[out:json][timeout:12];(
    node["amenity"~"car_rental|bicycle_rental|boat_rental|ski_rental"](around:RADIUS,LAT,LNG);
    way["amenity"~"car_rental|bicycle_rental|boat_rental|ski_rental"](around:RADIUS,LAT,LNG);
    node["shop"~"rental|motorcycle_rental"](around:RADIUS,LAT,LNG);
    way["shop"~"rental|motorcycle_rental"](around:RADIUS,LAT,LNG);
  );out body center;`,
};

// Overpass requires a User-Agent (rejects anonymous requests with 406).
// Kumi mirror first — overpass-api.de rate-limits per IP, which Vercel's
// shared egress IPs exhaust quickly.
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

async function fetchOverpassPlaces(lat: number, lng: number, category: string, radiusM: number): Promise<OverpassElement[]> {
  const query = (OVERPASS_QUERIES[category] ?? OVERPASS_QUERIES.venues)
    .replace(/LAT/g, String(lat))
    .replace(/LNG/g, String(lng))
    .replace(/RADIUS/g, String(Math.min(radiusM, 10000)));

  let lastErr: Error = new Error('Overpass unavailable');
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Nova-App/2.0 (contact@nova-app.com)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const d = await res.json() as { elements?: OverpassElement[] };
      return (d.elements ?? []).filter(e => e.tags?.name);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr;
}

async function enrichPlaceDescriptions(
  places: { name: string; type: string; address: string }[],
  city: string, category: string, apiKey: string
): Promise<string[]> {
  const CAT_LABELS: Record<string, string> = {
    shops:       'second-hand/vintage shop',
    venues:      'venue or entertainment space',
    restaurants: 'restaurant, café or bar',
    hotels:      'hotel or place to stay',
    rentals:     'rental service (bikes, cars, boats, equipment)',
  };
  const catLabel = CAT_LABELS[category] ?? 'venue or entertainment space';
  const prompt = `Write a punchy 2-sentence description for each of these ${places.length} real ${catLabel}s in ${city} for a social discovery app.
Sentence 1: what makes this place special and worth visiting.
Sentence 2: what the vibe and experience feels like.

${places.map((p, i) => `${i + 1}. "${p.name}" (${p.type}) at ${p.address || city}`).join('\n')}

Respond ONLY with a JSON array of ${places.length} strings. No markdown.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`Claude place desc ${res.status}`);
  const d = await res.json() as { content?: { text?: string }[] };
  const match = (d.content?.[0]?.text ?? '').match(/\[[\s\S]*\]/);
  if (!match) return places.map(p => `${p.name} is a great local ${catLabel} in ${city}.`);
  return JSON.parse(match[0]) as string[];
}

async function overpassToPost(
  el: OverpassElement, city: string, category: string, description: string,
  unsplashKey?: string, pexelsKey?: string
) {
  const elLat = el.lat ?? el.center?.lat ?? 0;
  const elLng = el.lon ?? el.center?.lon ?? 0;
  const tags  = el.tags ?? {};
  const name  = tags.name ?? 'Unknown';
  const addr  = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  const website = tags.website ?? tags['contact:website'] ?? tags['contact:url'] ?? '';
  const hours   = tags.opening_hours ?? '';
  const domain  = website ? (() => { try { return new URL(website).hostname; } catch { return ''; } })() : '';

  const cuisine = (tags.cuisine ?? '').split(';')[0].replace(/_/g, ' ');
  const stars   = tags.stars ?? '';
  const phone   = tags.phone ?? tags['contact:phone'] ?? '';

  const IMG_QUERIES: Record<string, string> = {
    shops:       'vintage thrift store interior clothing racks',
    venues:      'concert hall theatre interior stage lights',
    restaurants: cuisine ? `${cuisine} restaurant food dish` : 'cozy restaurant interior dinner table',
    hotels:      'elegant hotel room interior design',
    rentals:     'bicycle car rental shop city',
  };
  const imgQ = IMG_QUERIES[category] ?? `${category} place interior`;

  const image = await Promise.race([
    getImage(imgQ, unsplashKey, pexelsKey, `osm_${el.id}`),
    new Promise<string>(resolve => setTimeout(() => resolve(picsumUrl(`osm_${el.id}`)), 3000)),
  ]);

  const typeLabel: Record<string, string> = { shops: '🛍️', venues: '🎭', community: '🤝', restaurants: '🍽️', hotels: '🏨', rentals: '🚲' };
  const osmUrl = `https://www.openstreetmap.org/${el.type}/${el.id}`;

  const extras = [
    cuisine && category === 'restaurants' ? `🍴 ${cuisine.charAt(0).toUpperCase()}${cuisine.slice(1)} cuisine` : '',
    stars && category === 'hotels' ? `⭐ ${stars}-star` : '',
    hours ? `⏰ ${hours}` : '',
    phone ? `📞 ${phone}` : '',
  ].filter(Boolean).map(l => `\n${l}`).join('');

  return {
    id: `osm_${el.id}`,
    user: makeUser(name, domain || undefined),
    image,
    caption: `${description}\n\n${typeLabel[category] ?? '📍'} ${name}${addr ? `\n📍 ${addr}, ${city}` : `\n📍 ${city}`}${extras}${website ? `\n🔗 ${website}` : `\n🗺️ ${osmUrl}`}`,
    likes: Math.floor(Math.random() * 8_000) + 200,
    comments: Math.floor(Math.random() * 200) + 10,
    category: category as import('@/types').Category,
    hashtags: [`#${city.replace(/\s/g, '')}`, `#${category}`, '#nova', '#local', '#discover'],
    timestamp: Date.now() - Math.random() * 86_400_000,
    location: { name: `${name}, ${city}`, lat: elLat, lng: elLng },
    saved: false, liked: false,
    isEvent: false, isAIGenerated: false,
    eventUrl: website || osmUrl,
    organizer: name,
    price: '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticketmaster — real events with real images
// ─────────────────────────────────────────────────────────────────────────────

const TM_CATEGORY_MAP: Record<string, string[]> = {
  events:   ['Music', 'Arts & Theatre', 'Family', 'Miscellaneous'],
  music:    ['Music'],
  sports:   ['Sports'],
  art:      ['Arts & Theatre'],
  fitness:  ['Sports'],
  discover: ['Music', 'Sports', 'Arts & Theatre'],
};

async function fetchTicketmaster(
  lat: number, lng: number, category: string, page: number, radius: number, apiKey: string
): Promise<{ events: TmEvent[]; totalPages: number }> {
  const classifications = TM_CATEGORY_MAP[category] ?? TM_CATEGORY_MAP.events;
  const classParam = classifications.map(c => `classificationName=${encodeURIComponent(c)}`).join('&');
  const today = new Date();
  const end   = new Date(today); end.setDate(end.getDate() + 60);
  const url = [
    `https://app.ticketmaster.com/discovery/v2/events.json`,
    `?apikey=${apiKey}`,
    `&latlong=${lat},${lng}`,
    `&radius=${radius}&unit=km`,
    `&size=8&page=${page}`,
    `&${classParam}`,
    `&startDateTime=${today.toISOString().slice(0, 19)}Z`,
    `&endDateTime=${end.toISOString().slice(0, 19)}Z`,
    `&sort=date,asc&locale=*`,
  ].join('');

  const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
  if (!res.ok) throw new Error(`TM ${res.status}`);
  const d = await res.json() as {
    _embedded?: { events?: TmEvent[] };
    page?: { totalPages?: number };
  };
  return { events: d._embedded?.events ?? [], totalPages: d.page?.totalPages ?? 0 };
}

function tmEventToPost(ev: TmEvent, description: string, city: string, country: string) {
  const venue     = ev._embedded?.venues?.[0];
  const venueName = venue?.name ?? city;
  const venueAddr = venue?.address?.line1 ?? '';
  const lat       = parseFloat(venue?.location?.latitude  ?? '0') || 0;
  const lng       = parseFloat(venue?.location?.longitude ?? '0') || 0;
  const localDate = ev.dates?.start?.localDate ?? '';
  const localTime = ev.dates?.start?.localTime?.slice(0, 5) ?? '';
  const segment   = ev.classifications?.[0]?.segment?.name ?? 'Events';
  const genre     = ev.classifications?.[0]?.genre?.name ?? segment;
  const pr        = ev.priceRanges?.[0];
  const priceStr  = pr ? `${pr.currency} ${pr.min.toFixed(0)}–${pr.max.toFixed(0)}` : 'See website';
  const catMap: Record<string, string> = { 'Music': 'music', 'Sports': 'sports', 'Arts & Theatre': 'art', 'Family': 'events', 'Miscellaneous': 'events' };
  const category  = catMap[segment] ?? 'events';

  let eventDateStr = 'Date TBC';
  if (localDate) {
    try { eventDateStr = new Date(`${localDate}T${localTime || '00:00'}:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { /* ignore */ }
  }

  return {
    id: `tm_${ev.id}`,
    user: makeUser(venueName),
    image: bestTmImage(ev.images),
    caption: `${description}\n\n📅 ${eventDateStr}${localTime ? ` · ${localTime}` : ''}\n📍 ${venueName}${venueAddr ? `, ${venueAddr}` : ''}\n🎟️ ${priceStr}\n🔗 Tickets & info: ${ev.url}`,
    likes: Math.floor(Math.random() * 20_000) + 1_000,
    comments: Math.floor(Math.random() * 800) + 30,
    category,
    hashtags: [`#${city.replace(/\s/g, '')}`, ...(genre && genre !== 'undefined' ? [`#${genre.toLowerCase().replace(/\s+/g, '')}`] : []), '#nova', '#events', '#local'],
    timestamp: Date.now() - Math.random() * 7_200_000,
    location: { name: `${venueName}, ${city}`, lat, lng },
    saved: false, liked: false,
    isEvent: true, isAIGenerated: false,
    eventDate: `${eventDateStr}${localTime ? ` · ${localTime}` : ''}`,
    eventDateRaw: localDate,
    eventVenue: `${venueName}${venueAddr ? `, ${venueAddr}` : ''}`,
    eventUrl: ev.url,
    organizer: venueName,
    price: priceStr,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude — batch description enrichment
// ─────────────────────────────────────────────────────────────────────────────

async function enrichEventDescriptions(
  items: { name: string; venue: string; date: string; time: string; genre: string; price: string }[],
  city: string, apiKey: string
): Promise<string[]> {
  const prompt = `Write a vivid 3-sentence description for each of these ${items.length} real events in ${city}.
Sentence 1: what the event is and who's performing/involved.
Sentence 2: what makes this specific event unmissable.
Sentence 3: what the atmosphere will feel like in sensory detail.

${items.map((e, i) => `${i + 1}. "${e.name}" at ${e.venue} · ${e.date} ${e.time} · ${e.genre} · ${e.price}`).join('\n')}

Respond ONLY with a JSON array of ${items.length} strings. No markdown.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const d = await res.json() as { content?: { text?: string }[] };
  const match = (d.content?.[0]?.text ?? '').match(/\[[\s\S]*\]/);
  if (!match) return items.map(e => `${e.name} at ${e.venue}.`);
  return JSON.parse(match[0]) as string[];
}

async function enrichSightseeingDescriptions(
  pois: { name: string; extract: string }[],
  city: string, apiKey: string
): Promise<string[]> {
  const prompt = `Make these ${pois.length} Wikipedia descriptions more vivid and exciting for a social discovery app in ${city}.
Keep all factual details. Rewrite to 3 punchy sentences each: what it is + why it's special + what visiting feels like.

${pois.map((p, i) => `${i + 1}. ${p.name}: "${p.extract?.slice(0, 200) ?? 'A landmark in ' + city}"`).join('\n')}

Respond ONLY with a JSON array of ${pois.length} strings. No markdown.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`Claude sightseeing ${res.status}`);
  const d = await res.json() as { content?: { text?: string }[] };
  const match = (d.content?.[0]?.text ?? '').match(/\[[\s\S]*\]/);
  if (!match) return pois.map(p => p.extract?.slice(0, 300) ?? `${p.name} is a remarkable landmark in ${city}.`);
  return JSON.parse(match[0]) as string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude + web search — find REAL events when Ticketmaster has no coverage
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_GUIDANCE: Record<string, string> = {
  events:      'concerts, club nights, comedy shows, theatre, festivals, pop-up markets, cultural celebrations',
  music:       'concerts, club nights, jazz evenings, open mic nights, DJ sets, music festivals, live bands',
  sports:      'football/soccer matches, athletics, tennis, basketball, cycling, martial arts, fun runs, local league matches',
  fitness:     'outdoor yoga, running clubs, cycling events, gym open days, hiking groups, wellness retreats',
  food:        'restaurant weeks, food festivals, pop-up dining, wine tastings, cooking masterclasses, street food markets',
  art:         'gallery openings, museum exhibitions, street art tours, art fairs, photography exhibits, artist talks',
  sightseeing: 'guided landmark tours, museum timed entries, viewpoint access, historic site visits, river cruises, architectural walks',
  lifestyle:   'night markets, open-air cinema, pop-up boutiques, craft fairs, wellness events, community gatherings',
  discover:    'concerts, food festivals, art openings, sports matches, markets, fitness classes',
  community:   'free community meetups, neighbourhood gatherings, swap meets, volunteer events, local markets, cultural festivals, block parties, language exchanges, community clean-ups',
  travel:      'guided day trips, scenic excursions, walking tours, boat trips, wine region tours, nearby getaway experiences',
  tech:        'tech meetups, hackathons, startup events, coding workshops, developer conferences, maker fairs',
  pets:        'pet adoption days, dog meetups, animal shelter open days, pet expos, dog-friendly events',
  fashion:     'fashion pop-ups, designer markets, vintage sales, fashion shows, style workshops, sample sales',
  restaurants: 'restaurant openings, restaurant weeks, tasting menus, brunch specials, chef events, pop-up dining',
  hotels:      'hotel deals, spa weekends, rooftop bar events, special stay packages, boutique hotel openings',
  rentals:     'bike rental tours, e-scooter offers, boat rental experiences, ski equipment rental deals, car sharing offers',
};

async function searchRealEventsWithClaude(
  city: string, country: string, today: string, count: number, page: number, category: string, apiKey: string,
  unsplashKey?: string, pexelsKey?: string, userLat?: number, userLng?: number,
  tourismFocus = false
): Promise<unknown[]> {
  const guidance = CATEGORY_GUIDANCE[category] ?? CATEGORY_GUIDANCE.events;

  const tourismInstructions = tourismFocus
    ? `Search SPECIFICALLY on the official tourism websites and event calendars for ${city}:
- Search "${city} official tourism website events" and "${city} tourismus veranstaltungen" (use the local language of ${country} too)
- Check the city's official website event calendar and the regional tourism board for ${city}
- Focus on what locals and tourism boards promote: festivals, seasonal celebrations, wine/food festivals, open-air concerts, christmas/easter markets, city fairs, spa & culture events
These tourism-board events are often missing from ticket platforms — they are exactly what we want.`
    : `Good sources: the official ${city} tourism website and city event calendar (search in the local language of ${country} too, e.g. "veranstaltungen", "eventos", "événements"), Eventbrite, local newspapers, venue websites.`;

  const prompt = `Search the web for ${count} REAL upcoming events in ${city}, ${country} happening after ${today}.

Search for: ${guidance}

${tourismInstructions}

${page > 0 ? `Page ${page + 1}: find different events from earlier results — search for less obvious/mainstream options.` : ''}

For each real event you find, extract the exact details from the real event pages. Return ONLY a valid JSON array of ${count} objects:
[{
  "title": "exact real event name",
  "organizer": "exact organiser or promoter name",
  "website": "domain of the ticket or event site (e.g. 'eventbrite.com')",
  "venue": "exact venue name in ${city}",
  "address": "street address or district in ${city}",
  "date": "YYYY-MM-DD (within next 60 days)",
  "time": "HH:MM or empty string if unknown",
  "price": "exact price from the event page, or Free",
  "description": "2-3 sentences about this specific real event",
  "url": "exact URL to buy tickets or find info",
  "category": "${category}",
  "hashtags": ["#tag1","#tag2","#tag3","#tag4"],
  "imageQuery": "3-word atmospheric photo search query matching this event type"
}]

IMPORTANT: Only include events you confirmed exist via web search. Do not invent events.
Return only the raw JSON array, no markdown, no extra text.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Web search is GA — no beta header (sending one returns 400)
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`Claude web search ${res.status}`);

  const d = await res.json() as { content?: { type: string; text?: string }[] };
  // Concatenate all text blocks (the final response after tool use)
  const text = d.content?.filter(b => b.type === 'text').map(b => b.text ?? '').join('') ?? '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  const events = JSON.parse(match[0]) as Record<string, unknown>[];
  const now = Date.now();

  return Promise.all(events.map(async (ev, i) => {
    const title    = String(ev.title ?? `Event ${i + 1}`);
    const org      = String(ev.organizer ?? title);
    const website  = String(ev.website ?? '');
    const venue    = String(ev.venue ?? city);
    const address  = String(ev.address ?? '');
    const date     = String(ev.date ?? '');
    const time     = String(ev.time ?? '');
    const price    = String(ev.price ?? 'See website');
    const desc     = String(ev.description ?? '');
    const url      = String(ev.url ?? '#');
    const cat      = String(ev.category ?? category);
    const tags     = Array.isArray(ev.hashtags) ? ev.hashtags as string[] : [`#${city}`, '#events'];
    const imgQ     = String(ev.imageQuery ?? `${cat} ${city} event`);

    let eventDateStr = 'Date TBC';
    if (date) { try { eventDateStr = new Date(`${date}T${time || '00:00'}:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch { /* ignore */ } }

    const image = await Promise.race([
      getImage(imgQ, unsplashKey, pexelsKey, `${city}_${cat}_${page}_${i}`),
      new Promise<string>(resolve => setTimeout(() => resolve(picsumUrl(`${city}_${cat}_${page}_${i}`)), 4000)),
    ]);

    return {
      id: `${tourismFocus ? 'tour' : 'ws'}_${city}_p${page}_${i}_${Date.now()}`,
      user: makeUser(org, website || undefined),
      image,
      caption: `${desc}\n\n📅 ${eventDateStr}${time ? ` · ${time}` : ''}\n📍 ${venue}${address ? `, ${address}` : ''}\n🎟️ ${price}\n🔗 Tickets & info: ${url}`,
      likes: Math.floor(Math.random() * 12_000) + 500,
      comments: Math.floor(Math.random() * 400) + 20,
      category: cat,
      hashtags: tags,
      timestamp: now - Math.random() * 10_800_000,
      location: { name: `${venue}, ${city}`, lat: userLat ?? 0, lng: userLng ?? 0 },
      saved: false, liked: false,
      isEvent: true, isAIGenerated: false,
      eventDate: `${eventDateStr}${time ? ` · ${time}` : ''}`,
      eventDateRaw: date || null,
      eventVenue: `${venue}${address ? `, ${address}` : ''}`,
      eventUrl: url,
      organizer: org,
      price,
    };
  }));
}

// Last-resort fallback — only fires when every API fails. Uses real Unsplash/Pexels images.
async function hardFallback(
  city: string, country: string, page: number, count: number,
  unsplashKey?: string, pexelsKey?: string, userLat?: number, userLng?: number
) {
  const templates = [
    { title: 'Live Music Night', cat: 'music', domain: 'ra.co', price: '€15', imgQ: 'live music concert crowd' },
    { title: `${city} Food Festival`, cat: 'food', domain: 'eventbrite.com', price: 'Free', imgQ: 'street food festival market' },
    { title: 'Art Exhibition Opening', cat: 'art', domain: 'artfair.com', price: '€12', imgQ: 'art gallery exhibition opening' },
    { title: 'City Half Marathon', cat: 'sports', domain: 'active.com', price: '€25', imgQ: 'city marathon running race' },
    { title: 'Tech Meetup', cat: 'events', domain: 'meetup.com', price: 'Free', imgQ: 'tech meetup networking event' },
    { title: 'Night Market', cat: 'lifestyle', domain: 'timeout.com', price: 'Free', imgQ: 'night market lights crowd' },
    { title: 'Open Air Cinema', cat: 'events', domain: 'timeout.com', price: '€12', imgQ: 'outdoor cinema evening' },
    { title: 'Sightseeing Tour', cat: 'sightseeing', domain: 'viator.com', price: '€18', imgQ: 'city tour landmark architecture' },
  ];
  const now = Date.now();
  return Promise.all(templates.slice(0, count).map(async (t, i) => {
    const daysAhead = ((page * count + i) % 30) + 1;
    const eventDate = new Date(now + daysAhead * 86_400_000);
    const rawDate = eventDate.toISOString().split('T')[0];
    const dateStr = eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const image = await Promise.race([
      getImage(t.imgQ, unsplashKey, pexelsKey, `fb_${city}_${t.cat}_${page}_${i}`),
      new Promise<string>(resolve => setTimeout(() => resolve(picsumUrl(`fb_${city}_${t.cat}_${page}_${i}`)), 3000)),
    ]);
    return {
      id: `fb_${city}_p${page}_${i}`,
      user: makeUser(t.title, t.domain),
      image,
      caption: `Local ${t.title.toLowerCase()} happening in ${city}.\n\n📅 ${dateStr}, 19:00\n📍 ${city}, ${country}\n🎟️ ${t.price}\n🔗 https://${t.domain}`,
      likes: Math.floor(Math.random() * 5_000) + 100,
      comments: Math.floor(Math.random() * 100) + 5,
      category: t.cat,
      hashtags: [`#${city.replace(/\s/g, '')}`, `#${t.cat}`, '#nova', '#local'],
      timestamp: now - Math.random() * 7_200_000,
      location: { name: `${city}, ${country}`, lat: userLat ?? 0, lng: userLng ?? 0 },
      saved: false, liked: false,
      isEvent: true, isAIGenerated: true,
      eventDate: `${dateStr} · 19:00`,
      eventDateRaw: rawDate,
      eventVenue: city,
      eventUrl: `https://${t.domain}`,
      organizer: t.title,
      price: t.price,
    };
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Sanitize all inputs — prevents injection via URL params
  const city    = (searchParams.get('city')    || 'Vienna').slice(0, 100).replace(/[<>'"\\]/g, '');
  const country = (searchParams.get('country') || 'Austria').slice(0, 100).replace(/[<>'"\\]/g, '');
  const lat     = Math.max(-90,  Math.min(90,  parseFloat(searchParams.get('lat') || '48.2082')));
  const lng     = Math.max(-180, Math.min(180, parseFloat(searchParams.get('lng') || '16.3738')));
  const page    = Math.max(0, Math.min(20, parseInt(searchParams.get('page')   || '0',  10)));
  const radius  = Math.max(1, Math.min(200, parseInt(searchParams.get('radius') || '25', 10)));
  const count   = Math.max(1, Math.min(20, parseInt(searchParams.get('count')  || '8',  10)));
  const rawCat  = searchParams.get('category') ?? 'events';
  const category = VALID_CATEGORIES.has(rawCat) ? rawCat : 'events';
  const source  = searchParams.get('source') ?? '';

  const tmKey       = process.env.TICKETMASTER_API_KEY;
  const claudeKey   = process.env.ANTHROPIC_API_KEY;
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  const pexelsKey   = process.env.PEXELS_API_KEY;
  const today       = todayStr();

  // ── TOURISM: events promoted on the city's official tourism websites ──────
  // (festivals, markets, seasonal celebrations missing from ticket platforms)
  if (source === 'tourism') {
    if (claudeKey) {
      try {
        const posts = await searchRealEventsWithClaude(
          city, country, today, count, page, 'events', claudeKey,
          unsplashKey, pexelsKey, lat, lng, /* tourismFocus */ true
        );
        return NextResponse.json({ posts, city, country, source: 'tourism', hasMore: page < 4 }, { headers: NO_CACHE });
      } catch (err) {
        console.error('[events/tourism]', err);
      }
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
        pageEls.map((el, i) => overpassToPost(el, city, category, descriptions[i] ?? '', unsplashKey, pexelsKey))
      );

      const hasMore = (page + 1) * count < elements.length;
      return NextResponse.json({ posts, city, country, source: 'osm', hasMore }, { headers: PLACE_CACHE });
    } catch (err) {
      console.error('[events/overpass]', err);
      // Fall through to Claude web search as fallback
    }
  }

  // ── COMMUNITY: Claude web search for real local gatherings/meetups ─────────
  if (category === 'community') {
    if (claudeKey) {
      try {
        const posts = await searchRealEventsWithClaude(city, country, today, count, page, 'community', claudeKey, unsplashKey, pexelsKey, lat, lng);
        if (posts.length > 0) {
          return NextResponse.json({ posts, city, country, source: 'web_search', hasMore: page < 8 }, { headers: NO_CACHE });
        }
      } catch (err) {
        console.error('[events/community]', err);
      }
    }
    const fallbackPosts = await hardFallback(city, country, page, count, unsplashKey, pexelsKey, lat, lng);
    return NextResponse.json({ posts: fallbackPosts, city, country, source: 'fallback', hasMore: false }, { headers: NO_CACHE });
  }

  // ── SIGHTSEEING: Wikipedia GeoSearch + Summary API (free, real photos) ────
  if (category === 'sightseeing') {
    try {
      // Use radius in meters, capped at Wikipedia's max of 10000m
      const radiusM = Math.min(radius * 1000, 10000);
      const nearby = await fetchWikipediaNearby(lat, lng, radiusM);

      if (nearby.length === 0) throw new Error('No Wikipedia articles nearby');

      // Paginate through the 50 results
      const pagePOIs = nearby.slice(page * count, page * count + count);
      if (pagePOIs.length === 0) {
        return NextResponse.json({ posts: [], city, country, source: 'wikipedia', hasMore: false }, { headers: WIKI_CACHE });
      }

      // Fetch summaries (real descriptions + real Wikipedia photos) in parallel
      const summaries = await Promise.all(pagePOIs.map(p => fetchWikipediaSummary(p.title)));

      // Enrich with Claude for social-friendly descriptions
      const poiData = pagePOIs.map((p, i) => ({
        name: p.title,
        extract: summaries[i]?.extract ?? `${p.title} is a landmark near ${city}.`,
      }));

      const descriptions = claudeKey
        ? await enrichSightseeingDescriptions(poiData, city, claudeKey)
            .catch(() => poiData.map(p => p.extract.slice(0, 300)))
        : poiData.map(p => p.extract.slice(0, 300));

      const posts = await Promise.all(pagePOIs.map(async (poi, i) => {
        const summary = summaries[i];
        const wikiImg = summary?.thumbnail?.source;
        const wikiUrl = summary?.content_urls?.desktop?.page
          ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(poi.title.replace(/ /g, '_'))}`;

        // Prefer Wikipedia's own image (proxied); fall back to Unsplash/Pexels/picsum
        const image = wikiImg
          ? proxyImage(wikiImg)
          : await getImage(`${poi.title} ${city} landmark`, unsplashKey, pexelsKey, `wiki_${poi.pageid}`);

        const desc = descriptions[i] ?? poiData[i].extract.slice(0, 300);

        return {
          id: `wiki_${poi.pageid}`,
          user: makeUser(poi.title),
          image,
          caption: `${desc}\n\n🏛️ ${summary?.description ?? 'Landmark'}\n📍 ${poi.title}, ${city}\n📏 ${Math.round(poi.dist)}m from centre\n🔗 Learn more: ${wikiUrl}`,
          likes: Math.floor(Math.random() * 30_000) + 2_000,
          comments: Math.floor(Math.random() * 600) + 20,
          category: 'sightseeing',
          hashtags: [`#${city.replace(/\s/g, '')}`, '#sightseeing', '#nova', '#travel', '#landmark'],
          timestamp: Date.now() - Math.random() * 86_400_000,
          location: { name: `${poi.title}, ${city}`, lat: poi.lat, lng: poi.lon },
          saved: false, liked: false,
          isEvent: false, isAIGenerated: false,
          eventUrl: wikiUrl,
          organizer: poi.title,
        };
      }));

      const hasMore = (page + 1) * count < nearby.length;
      return NextResponse.json({ posts, city, country, source: 'wikipedia', hasMore }, { headers: WIKI_CACHE });
    } catch (err) {
      console.error('[events/sightseeing/wikipedia]', err);
      // Fall through to Claude for sightseeing
    }
  }

  // ── EVENTS / SPORTS / MUSIC: Ticketmaster + Claude running in parallel ──────
  // Claude starts immediately alongside Ticketmaster so TM latency doesn't eat
  // into Claude's budget. We use TM result if it has events, else Claude.
  if (category !== 'sightseeing') {
    // Fire Claude immediately (don't wait for TM to finish first)
    const claudePromise: Promise<unknown[] | null> = claudeKey
      ? searchRealEventsWithClaude(city, country, today, count, page, category, claudeKey, unsplashKey, pexelsKey, lat, lng).catch(() => null)
      : Promise.resolve(null);

    // Attempt Ticketmaster only for categories it actually covers — everything
    // else (food, tech, pets, fashion, travel, …) goes to Claude web search,
    // which finds these on local/tourism websites instead.
    if (tmKey && TM_CATEGORY_MAP[category]) {
      try {
        // Smart radius: if the requested radius returns sparse results, automatically
        // expand server-side so the client always gets a full page of content
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
          // TM has events — enrich with Claude and return real data
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

          const posts = tmEvents.map((ev, i) => tmEventToPost(ev, descriptions[i] ?? '', city, country));
          return NextResponse.json({ posts, city, country, source: 'ticketmaster', hasMore: page < totalPages - 1, totalPages }, { headers: NO_CACHE });
        }
        // TM returned 0 → fall through to use claudePromise result
      } catch (err) {
        console.error('[events/ticketmaster]', err);
        // Fall through to use claudePromise result
      }
    }

    // No TM results — use the Claude generation that was already running
    const claudePosts = await claudePromise;
    if (claudePosts && claudePosts.length > 0) {
      return NextResponse.json({ posts: claudePosts, city, country, source: 'claude', hasMore: page < 10 }, { headers: NO_CACHE });
    }
  }

  // ── SIGHTSEEING Claude fallback (if Wikipedia failed above) ───────────────
  if (category === 'sightseeing' && claudeKey) {
    try {
      const posts = await searchRealEventsWithClaude(city, country, today, count, page, category, claudeKey, unsplashKey, pexelsKey, lat, lng);
      if (posts.length > 0) {
        return NextResponse.json({ posts, city, country, source: 'claude', hasMore: page < 10 }, { headers: NO_CACHE });
      }
    } catch (err) {
      console.error('[events/sightseeing/claude]', err);
    }
  }

  // ── LAST RESORT: hardcoded templates with real images ────────────────────
  const fallbackPosts = await hardFallback(city, country, page, count, unsplashKey, pexelsKey, lat, lng);
  return NextResponse.json({
    posts: fallbackPosts,
    city, country, source: 'fallback', hasMore: page < 5,
  }, { headers: NO_CACHE });
}
