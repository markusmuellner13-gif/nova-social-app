// Overpass (OpenStreetMap) — the app's free, worldwide, no-key engine for REAL
// local places: restaurants, cafés, bars, pubs, clubs, theatres, cinemas,
// museums, galleries, churches, parks, markets, libraries, gyms, hotels, thrift
// shops and more. Every town on earth has these in OSM, so a small-town feed is
// never empty — and it's all free (no Anthropic/LLM credits).
//
// Posts carry the venue's REAL data: opening hours, website, phone, cuisine, and
// a real photo when OSM has one (image / wikimedia_commons tags) or the venue's
// own website advertises an og:image. Descriptions are written locally from the
// tags — no LLM in the loop.

import { ApiPost, makeUser, proxyImage } from './shared';
import { placesBudgetExceeded, notePlacesCall } from '@/lib/placesBudget';
import { fetchCommonsImagesByWikidata } from './wikipedia';

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

// One Overpass query per app category. Each pulls the real-world place types a
// user would expect under that chip. `["name"]` keeps out unnamed clutter.
const OVERPASS_QUERIES: Record<string, string> = {
  // Eat & drink — the backbone of any town's feed
  restaurants: `[out:json][timeout:12];(
    node["amenity"~"^(restaurant|cafe|bar|pub|biergarten|fast_food|ice_cream|food_court)$"]["name"](around:RADIUS,LAT,LNG);
    way["amenity"~"^(restaurant|cafe|bar|pub|biergarten|fast_food|ice_cream|food_court)$"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,

  // Going out — where things actually happen at night / on stage
  venues: `[out:json][timeout:12];(
    node["amenity"~"^(theatre|concert_hall|nightclub|music_venue|arts_centre|cinema|events_venue)$"]["name"](around:RADIUS,LAT,LNG);
    way["amenity"~"^(theatre|concert_hall|nightclub|music_venue|arts_centre|cinema|events_venue)$"]["name"](around:RADIUS,LAT,LNG);
    node["leisure"~"^(stadium|sports_hall|arena|dance)$"]["name"](around:RADIUS,LAT,LNG);
    way["leisure"~"^(stadium|sports_hall|arena|dance)$"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,

  // Live music & nightlife specifically
  music: `[out:json][timeout:12];(
    node["amenity"~"^(nightclub|music_venue|concert_hall)$"]["name"](around:RADIUS,LAT,LNG);
    way["amenity"~"^(nightclub|music_venue|concert_hall)$"]["name"](around:RADIUS,LAT,LNG);
    node["amenity"~"^(bar|pub)$"]["live_music"="yes"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,

  // Culture — museums, galleries, art spaces
  art: `[out:json][timeout:12];(
    node["tourism"~"^(museum|gallery|artwork)$"]["name"](around:RADIUS,LAT,LNG);
    way["tourism"~"^(museum|gallery|artwork)$"]["name"](around:RADIUS,LAT,LNG);
    node["amenity"="arts_centre"]["name"](around:RADIUS,LAT,LNG);
    way["amenity"="arts_centre"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,

  // Sightseeing — landmarks, churches, monuments, viewpoints, parks
  sightseeing: `[out:json][timeout:12];(
    node["tourism"~"^(attraction|viewpoint|artwork|museum|gallery)$"]["name"](around:RADIUS,LAT,LNG);
    way["tourism"~"^(attraction|viewpoint|artwork|museum|gallery)$"]["name"](around:RADIUS,LAT,LNG);
    node["historic"~"^(monument|memorial|castle|ruins|archaeological_site|fort|city_gate|tower)$"]["name"](around:RADIUS,LAT,LNG);
    way["historic"~"^(monument|memorial|castle|ruins|archaeological_site|fort|city_gate|tower)$"]["name"](around:RADIUS,LAT,LNG);
    node["amenity"="place_of_worship"]["name"](around:RADIUS,LAT,LNG);
    way["amenity"="place_of_worship"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,

  // Community — the civic & social fabric (churches, libraries, markets, halls)
  community: `[out:json][timeout:12];(
    node["amenity"~"^(community_centre|library|marketplace|townhall|social_centre|place_of_worship)$"]["name"](around:RADIUS,LAT,LNG);
    way["amenity"~"^(community_centre|library|marketplace|townhall|social_centre|place_of_worship)$"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,

  // Active — gyms, pools, sports centres, courts
  fitness: `[out:json][timeout:12];(
    node["leisure"~"^(fitness_centre|sports_centre|swimming_pool|pitch|track|climbing)$"]["name"](around:RADIUS,LAT,LNG);
    way["leisure"~"^(fitness_centre|sports_centre|swimming_pool|pitch|track|climbing)$"]["name"](around:RADIUS,LAT,LNG);
    node["amenity"="gym"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,

  // Sport — places to play & watch
  sports: `[out:json][timeout:12];(
    node["leisure"~"^(stadium|sports_centre|pitch|track|sports_hall|swimming_pool|golf_course)$"]["name"](around:RADIUS,LAT,LNG);
    way["leisure"~"^(stadium|sports_centre|pitch|track|sports_hall|swimming_pool|golf_course)$"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,

  // Wellbeing & green space — spas, parks, gardens, beauty
  lifestyle: `[out:json][timeout:12];(
    node["leisure"~"^(park|garden|nature_reserve)$"]["name"](around:RADIUS,LAT,LNG);
    way["leisure"~"^(park|garden|nature_reserve)$"]["name"](around:RADIUS,LAT,LNG);
    node["amenity"~"^(spa|public_bath)$"]["name"](around:RADIUS,LAT,LNG);
    node["shop"~"^(beauty|hairdresser|massage|cosmetics)$"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,

  // Stay
  hotels: `[out:json][timeout:12];(
    node["tourism"~"^(hotel|guest_house|hostel|motel|apartment|chalet)$"]["name"](around:RADIUS,LAT,LNG);
    way["tourism"~"^(hotel|guest_house|hostel|motel|apartment|chalet)$"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,

  // Thrift, vintage & second-hand finds
  shops: `[out:json][timeout:12];(
    node["shop"~"^(second_hand|vintage|charity|antiques|thrift)$"]["name"](around:RADIUS,LAT,LNG);
    way["shop"~"^(second_hand|vintage|charity|antiques|thrift)$"]["name"](around:RADIUS,LAT,LNG);
    node["shop"="clothes"]["second_hand"="yes"]["name"](around:RADIUS,LAT,LNG);
    node["shop"="books"]["second_hand"="yes"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,

  // Fashion & boutiques
  fashion: `[out:json][timeout:12];(
    node["shop"~"^(clothes|boutique|shoes|jewelry|bag|fashion_accessories|tailor)$"]["name"](around:RADIUS,LAT,LNG);
    way["shop"~"^(clothes|boutique|shoes|jewelry|bag|fashion_accessories|tailor)$"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,

  // Pets
  pets: `[out:json][timeout:12];(
    node["shop"="pet"]["name"](around:RADIUS,LAT,LNG);
    node["amenity"="veterinary"]["name"](around:RADIUS,LAT,LNG);
    node["leisure"="dog_park"]["name"](around:RADIUS,LAT,LNG);
    way["leisure"="dog_park"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,

  // Rentals — get around / gear up
  rentals: `[out:json][timeout:12];(
    node["amenity"~"^(car_rental|bicycle_rental|boat_rental|ski_rental)$"]["name"](around:RADIUS,LAT,LNG);
    way["amenity"~"^(car_rental|bicycle_rental|boat_rental|ski_rental)$"]["name"](around:RADIUS,LAT,LNG);
    node["shop"~"rental|motorcycle_rental"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,

  // Outdoors & nature — hiking, cycling, lakes, rivers, peaks, beaches, trails
  outdoors: `[out:json][timeout:12];(
    node["natural"~"^(peak|beach|spring|waterfall|cliff|cave_entrance|bay|volcano)$"]["name"](around:RADIUS,LAT,LNG);
    way["natural"~"^(water|wood|beach|cliff|bay)$"]["name"](around:RADIUS,LAT,LNG);
    way["water"~"^(lake|pond|reservoir|lagoon)$"]["name"](around:RADIUS,LAT,LNG);
    way["waterway"~"^(river|canal|stream)$"]["name"](around:RADIUS,LAT,LNG);
    node["tourism"~"^(viewpoint|camp_site|picnic_site|wilderness_hut|alpine_hut)$"]["name"](around:RADIUS,LAT,LNG);
    node["leisure"~"^(nature_reserve|beach_resort|bird_hide)$"]["name"](around:RADIUS,LAT,LNG);
    way["leisure"~"^(nature_reserve|park)$"]["name"](around:RADIUS,LAT,LNG);
    node["information"="guidepost"]["name"](around:RADIUS,LAT,LNG);
    relation["route"~"^(hiking|foot|bicycle|mtb)$"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,

  // Travel — things to see + places to stay for visitors
  travel: `[out:json][timeout:12];(
    node["tourism"~"^(attraction|viewpoint|hotel|guest_house|information|gallery|museum)$"]["name"](around:RADIUS,LAT,LNG);
    way["tourism"~"^(attraction|viewpoint|hotel|guest_house|gallery|museum)$"]["name"](around:RADIUS,LAT,LNG);
  );out body center;`,
};

// Categories OSM can serve directly (used by the feed route to decide routing).
export const OSM_SUPPORTED = new Set(Object.keys(OVERPASS_QUERIES).concat(['food']));

// Overpass requires a User-Agent (rejects anonymous requests with 406).
// Kumi mirror first — overpass-api.de rate-limits per IP, which Vercel's
// shared egress IPs exhaust quickly.
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

export async function fetchOverpassPlaces(lat: number, lng: number, category: string, radiusM: number): Promise<OverpassElement[]> {
  const cat = category === 'food' ? 'restaurants' : category;
  const query = (OVERPASS_QUERIES[cat] ?? OVERPASS_QUERIES.venues)
    .replace(/LAT/g, String(lat))
    .replace(/LNG/g, String(lng))
    .replace(/RADIUS/g, String(Math.min(radiusM, 12000)));

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
        signal: AbortSignal.timeout(13000),
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

// ── og:image lookup — the venue's real photo from its own website ──────────
// Best-effort with a short timeout; cached for the warm lambda's lifetime.
const ogImageCache = new Map<string, string | null>();

export async function fetchOgImage(website: string): Promise<string | null> {
  if (ogImageCache.has(website)) return ogImageCache.get(website) ?? null;
  let result: string | null = null;
  try {
    const res = await fetch(website, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Nova-App/2.0)' },
      signal: AbortSignal.timeout(2500),
      redirect: 'follow',
    });
    if (res.ok && (res.headers.get('content-type') ?? '').includes('html')) {
      // Read only the head-ish part — og tags live early in the document
      const html = (await res.text()).slice(0, 60_000);
      const m = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)
             ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i);
      const url = m?.[1];
      if (url && /^https?:\/\//.test(url)) result = url;
    }
  } catch { /* no og image */ }
  ogImageCache.set(website, result);
  return result;
}

// ── Google Places photo (gated on GOOGLE_PLACES_API_KEY) ──────────────────────
// The highest-quality "real photo of the actual venue" source. The key is read
// from env and never reaches the client: we resolve the Places photo redirect
// server-side and return the final googleusercontent URL. No key → returns null.
const placePhotoCache = new Map<string, string | null>();

export async function fetchGooglePlacePhoto(name: string, lat: number, lng: number): Promise<string | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  const cacheKey = `${name}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
  if (placePhotoCache.has(cacheKey)) return placePhotoCache.get(cacheKey) ?? null;

  // Respect the soft daily spend cap (PLACES_DAILY_BUDGET). Once hit, we stop
  // calling Places and fall back to the free photo sources — cost stays bounded.
  if (await placesBudgetExceeded()) return null;

  let result: string | null = null;
  try {
    await notePlacesCall();
    const findUrl =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(name)}&inputtype=textquery` +
      `&locationbias=point:${lat},${lng}&fields=photos&key=${key}`;
    const findRes = await fetch(findUrl, { signal: AbortSignal.timeout(3000) });
    if (findRes.ok) {
      const d = await findRes.json() as { candidates?: { photos?: { photo_reference?: string }[] }[] };
      const ref = d.candidates?.[0]?.photos?.[0]?.photo_reference;
      if (ref) {
        const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1600&photo_reference=${ref}&key=${key}`;
        const photoRes = await fetch(photoUrl, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
        result = photoRes.headers.get('location');
      }
    }
  } catch { /* fall through to og:image / stock */ }
  placePhotoCache.set(cacheKey, result);
  return result;
}

// ── A photo straight from OSM's own tags (free, real, no extra request) ───────
// Many landmarks, churches, museums and parks carry an `image` URL or a
// `wikimedia_commons` file reference right in OpenStreetMap.
function osmTagImage(tags: Record<string, string>): string | null {
  const direct = tags.image ?? tags['image:0'] ?? '';
  if (/^https?:\/\/\S+\.(jpe?g|png|webp|gif)/i.test(direct)) return direct;
  const commons = tags.wikimedia_commons ?? tags['image:wikimedia'] ?? '';
  if (commons.startsWith('File:')) {
    const file = commons.slice('File:'.length);
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1600`;
  }
  return null;
}

// ── Human-readable type + a free, varied description from the OSM tags ─────────
// No LLM: we read the place's real tags and write a natural caption ourselves.
function placeKind(tags: Record<string, string>): { label: string; emoji: string } {
  const a = tags.amenity ?? '', t = tags.tourism ?? '', l = tags.leisure ?? '',
        h = tags.historic ?? '', s = tags.shop ?? '',
        n = tags.natural ?? '', w = tags.water ?? '', wy = tags.waterway ?? '', rt = tags.route ?? '';
  const map: Record<string, { label: string; emoji: string }> = {
    restaurant: { label: 'restaurant', emoji: '🍽️' }, cafe: { label: 'café', emoji: '☕' },
    bar: { label: 'bar', emoji: '🍸' }, pub: { label: 'pub', emoji: '🍺' },
    biergarten: { label: 'beer garden', emoji: '🍺' }, fast_food: { label: 'eatery', emoji: '🍔' },
    ice_cream: { label: 'gelateria', emoji: '🍦' }, food_court: { label: 'food court', emoji: '🍽️' },
    theatre: { label: 'theatre', emoji: '🎭' }, concert_hall: { label: 'concert hall', emoji: '🎶' },
    nightclub: { label: 'club', emoji: '🪩' }, music_venue: { label: 'live-music venue', emoji: '🎸' },
    arts_centre: { label: 'arts centre', emoji: '🎨' }, cinema: { label: 'cinema', emoji: '🎬' },
    events_venue: { label: 'events venue', emoji: '✨' }, community_centre: { label: 'community centre', emoji: '🤝' },
    library: { label: 'library', emoji: '📚' }, marketplace: { label: 'market', emoji: '🧺' },
    townhall: { label: 'town hall', emoji: '🏛️' }, social_centre: { label: 'social club', emoji: '🤝' },
    place_of_worship: { label: 'church', emoji: '⛪' }, gym: { label: 'gym', emoji: '💪' },
    spa: { label: 'spa', emoji: '💆' }, public_bath: { label: 'thermal bath', emoji: '♨️' },
    veterinary: { label: 'vet', emoji: '🐾' },
  };
  if (a && map[a]) return map[a];
  if (t === 'museum') return { label: 'museum', emoji: '🏛️' };
  if (t === 'gallery') return { label: 'gallery', emoji: '🖼️' };
  if (t === 'artwork') return { label: 'public artwork', emoji: '🗿' };
  if (t === 'viewpoint') return { label: 'viewpoint', emoji: '🌅' };
  if (t === 'attraction') return { label: 'attraction', emoji: '📸' };
  if (t === 'hotel' || t === 'motel') return { label: 'hotel', emoji: '🏨' };
  if (t === 'guest_house') return { label: 'guest house', emoji: '🏨' };
  if (t === 'hostel') return { label: 'hostel', emoji: '🛏️' };
  if (t === 'apartment' || t === 'chalet') return { label: 'stay', emoji: '🏡' };
  if (t === 'information') return { label: 'visitor info', emoji: 'ℹ️' };
  if (t === 'camp_site') return { label: 'campsite', emoji: '🏕️' };
  if (t === 'picnic_site') return { label: 'picnic spot', emoji: '🧺' };
  if (t === 'alpine_hut' || t === 'wilderness_hut') return { label: 'mountain hut', emoji: '🏔️' };
  // Outdoors & nature
  if (rt === 'hiking' || rt === 'foot') return { label: 'hiking trail', emoji: '🥾' };
  if (rt === 'bicycle' || rt === 'mtb') return { label: 'cycling route', emoji: '🚴' };
  if (n === 'peak' || n === 'volcano') return { label: 'summit', emoji: '⛰️' };
  if (n === 'beach' || l === 'beach_resort') return { label: 'beach', emoji: '🏖️' };
  if (n === 'waterfall') return { label: 'waterfall', emoji: '💦' };
  if (n === 'spring') return { label: 'spring', emoji: '⛲' };
  if (n === 'cliff') return { label: 'cliff', emoji: '🧗' };
  if (n === 'cave_entrance') return { label: 'cave', emoji: '🕳️' };
  if (n === 'bay') return { label: 'bay', emoji: '🌊' };
  if (n === 'wood') return { label: 'woodland', emoji: '🌲' };
  if (w === 'lake' || w === 'pond' || w === 'reservoir' || w === 'lagoon' || n === 'water') return { label: 'lake', emoji: '🏞️' };
  if (wy === 'river' || wy === 'canal' || wy === 'stream') return { label: 'river', emoji: '🏞️' };
  if (tags.information === 'guidepost') return { label: 'trailhead', emoji: '🪧' };
  if (l === 'park') return { label: 'park', emoji: '🌳' };
  if (l === 'garden') return { label: 'garden', emoji: '🌷' };
  if (l === 'nature_reserve') return { label: 'nature reserve', emoji: '🏞️' };
  if (l === 'beach_resort') return { label: 'beach', emoji: '🏖️' };
  if (l === 'bird_hide') return { label: 'birdwatching spot', emoji: '🦅' };
  if (l === 'dog_park') return { label: 'dog park', emoji: '🐕' };
  if (l === 'fitness_centre') return { label: 'fitness studio', emoji: '💪' };
  if (l === 'sports_centre' || l === 'sports_hall') return { label: 'sports centre', emoji: '🏟️' };
  if (l === 'swimming_pool') return { label: 'pool', emoji: '🏊' };
  if (l === 'stadium' || l === 'arena') return { label: 'stadium', emoji: '🏟️' };
  if (l === 'pitch' || l === 'track') return { label: 'sports ground', emoji: '⚽' };
  if (l === 'golf_course') return { label: 'golf course', emoji: '⛳' };
  if (l === 'climbing') return { label: 'climbing gym', emoji: '🧗' };
  if (h === 'castle' || h === 'fort') return { label: 'castle', emoji: '🏰' };
  if (h === 'monument' || h === 'memorial') return { label: 'monument', emoji: '🗿' };
  if (h === 'ruins' || h === 'archaeological_site') return { label: 'historic site', emoji: '🏛️' };
  if (h === 'tower' || h === 'city_gate') return { label: 'landmark', emoji: '🗼' };
  if (s === 'second_hand' || s === 'charity' || s === 'thrift') return { label: 'thrift shop', emoji: '🛍️' };
  if (s === 'vintage' || s === 'antiques') return { label: 'vintage shop', emoji: '🕰️' };
  if (s === 'books') return { label: 'bookshop', emoji: '📖' };
  if (s === 'clothes' || s === 'boutique' || s === 'fashion_accessories') return { label: 'boutique', emoji: '👗' };
  if (s === 'shoes') return { label: 'shoe shop', emoji: '👟' };
  if (s === 'jewelry' || s === 'bag') return { label: 'boutique', emoji: '💍' };
  if (s === 'beauty' || s === 'cosmetics') return { label: 'beauty studio', emoji: '💅' };
  if (s === 'hairdresser') return { label: 'salon', emoji: '💇' };
  if (s === 'massage') return { label: 'massage studio', emoji: '💆' };
  if (s === 'pet') return { label: 'pet shop', emoji: '🐾' };
  return { label: 'spot', emoji: '📍' };
}

function pick<T>(arr: T[], seed: number): T { return arr[Math.abs(seed) % arr.length]; }

function describePlace(tags: Record<string, string>, city: string, seed: number): string {
  const { label } = placeKind(tags);
  const name = tags.name ?? 'This spot';
  const cuisine = (tags.cuisine ?? '').split(';')[0].replace(/_/g, ' ');
  const a = tags.amenity ?? '', t = tags.tourism ?? '', l = tags.leisure ?? '', h = tags.historic ?? '';
  const n = tags.natural ?? '', wy = tags.waterway ?? '', rt = tags.route ?? '', w = tags.water ?? '';

  // Outdoors & nature — hikes, water, peaks, trails
  if (rt === 'hiking' || rt === 'foot' || rt === 'bicycle' || rt === 'mtb') {
    const kind = (rt === 'bicycle' || rt === 'mtb') ? 'ride' : 'hike';
    return pick([
      `Lace up for ${name} — a ${label} near ${city} that's worth the effort for the views alone.`,
      `${name} is one of the ${city} area's favourite routes. Pack water, bring a friend, and enjoy the ${kind}.`,
    ], seed);
  }
  if (n === 'peak' || n === 'volcano') return `${name} towers over ${city} — a summit worth the climb for the panorama at the top.`;
  if (w === 'lake' || w === 'pond' || w === 'reservoir' || w === 'lagoon' || n === 'water' || wy || n === 'beach' || n === 'bay' || n === 'waterfall') {
    return pick([
      `${name} is the ${city} area's spot to cool off, paddle, or just sit by the water and unwind.`,
      `Head to ${name} for a breath of fresh air near ${city} — bring a towel and make a day of it.`,
    ], seed);
  }
  if (n || t === 'camp_site' || t === 'picnic_site' || t === 'alpine_hut' || t === 'wilderness_hut' || tags.information === 'guidepost') {
    return `${name} is a slice of the great outdoors near ${city} — fresh air, nature and a change of pace.`;
  }

  // Food & drink
  if (['restaurant', 'cafe', 'bar', 'pub', 'biergarten', 'fast_food', 'ice_cream', 'food_court'].includes(a)) {
    const food = cuisine ? `${cuisine} ` : '';
    return pick([
      `${name} is one of ${city}'s favourite ${food}${label}s — pull up a chair and stay a while.`,
      `A local go-to in ${city}, ${name} serves up ${food}${label === 'café' ? 'coffee and good vibes' : 'a proper bite and a relaxed atmosphere'}.`,
      `Looking for a ${food}${label} in ${city}? ${name} is the kind of place regulars keep coming back to.`,
    ], seed);
  }
  // Going out
  if (['theatre', 'concert_hall', 'nightclub', 'music_venue', 'arts_centre', 'cinema', 'events_venue'].includes(a)) {
    return pick([
      `${name} is where ${city} comes alive — check what's on at this ${label} and make a night of it.`,
      `One of ${city}'s top spots for a night out, ${name} keeps the local ${label} scene buzzing.`,
      `${name} — a ${label} in the heart of ${city}. See what's on the bill and grab your crew.`,
    ], seed);
  }
  // Culture & sightseeing
  if (t === 'museum' || t === 'gallery' || a === 'arts_centre' || h) {
    return pick([
      `${name} is one of ${city}'s cultural gems — well worth an afternoon exploring.`,
      `Soak up some history at ${name}, a ${label} that locals are quietly proud of.`,
      `${name} — a piece of ${city} worth seeing up close. Bring a camera.`,
    ], seed);
  }
  if (a === 'place_of_worship') {
    return pick([
      `${name} is a beautiful ${city} landmark — striking architecture and a calm moment away from the bustle.`,
      `Step inside ${name}, one of ${city}'s most photographed spots, and take it all in.`,
    ], seed);
  }
  if (t === 'viewpoint' || t === 'attraction' || t === 'artwork') {
    return pick([
      `${name} is a ${city} must-see — exactly the kind of spot you'll want to share.`,
      `Add ${name} to your ${city} list — a local highlight that never gets old.`,
    ], seed);
  }
  // Green & wellbeing
  if (l === 'park' || l === 'garden' || l === 'nature_reserve' || l === 'dog_park') {
    return pick([
      `${name} is ${city}'s breath of fresh air — perfect for a walk, a picnic or just slowing down.`,
      `Escape the noise at ${name}, a green corner of ${city} the locals love.`,
    ], seed);
  }
  if (a === 'spa' || a === 'public_bath' || ['beauty', 'hairdresser', 'massage', 'cosmetics'].includes(tags.shop ?? '')) {
    return `Treat yourself at ${name} — a ${city} ${label} for a little well-earned downtime.`;
  }
  // Active
  if (a === 'gym' || ['fitness_centre', 'sports_centre', 'swimming_pool', 'pitch', 'track', 'stadium', 'arena', 'climbing', 'golf_course', 'sports_hall'].includes(l)) {
    return pick([
      `${name} is where ${city} gets moving — drop in and break a sweat.`,
      `Stay active in ${city} at ${name}, a local ${label} for all levels.`,
    ], seed);
  }
  // Stay
  if (['hotel', 'guest_house', 'hostel', 'motel', 'apartment', 'chalet'].includes(t)) {
    return pick([
      `${name} — a welcoming ${label} in ${city}, whether you're visiting or treating yourself to a staycation.`,
      `Rest easy at ${name}, a ${city} ${label} that knows how to make guests feel at home.`,
    ], seed);
  }
  // Community
  if (['community_centre', 'library', 'marketplace', 'townhall', 'social_centre'].includes(a)) {
    return pick([
      `${name} is part of what makes ${city} tick — a community ${label} worth knowing about.`,
      `${name} brings ${city} together — see what's happening at this local ${label}.`,
    ], seed);
  }
  // Shops
  if (tags.shop) {
    return pick([
      `${name} is a ${city} ${label} worth a rummage — you never know what you'll find.`,
      `Discover ${name}, a ${label} that gives ${city} its character.`,
    ], seed);
  }
  return `${name} is a local ${label} in ${city} worth checking out.`;
}

// ── Lightweight "open now" hint for the simplest opening_hours patterns ───────
// opening_hours is a rich mini-language; we only confidently evaluate the common
// "Mo-Fr 09:00-18:00" style and 24/7. Anything we can't parse → no claim (honest).
function openNow(hours: string): boolean | null {
  if (!hours) return null;
  if (/24\/7/.test(hours)) return true;
  const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const now = new Date();
  const today = days[now.getDay()];
  const mins = now.getHours() * 60 + now.getMinutes();
  // Only handle simple, comma-separated "DAYS HH:MM-HH:MM" rules.
  if (/[;[]/.test(hours) && !hours.includes(',')) { /* still try below */ }
  let matchedAnyRule = false;
  for (const rule of hours.split(';')) {
    const m = rule.trim().match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))*)\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!m) return null; // unknown shape → don't guess
    matchedAnyRule = true;
    const [, dayspec, h1, m1, h2, m2] = m;
    const inDays = (() => {
      if (dayspec.includes('-')) {
        const [a, b] = dayspec.split('-').map(s => days.indexOf(s.trim()));
        const ti = days.indexOf(today);
        if (a <= b) return ti >= a && ti <= b;
        return ti >= a || ti <= b; // wraps the week
      }
      return dayspec.split(',').map(s => s.trim()).includes(today);
    })();
    if (!inDays) continue;
    const start = (+h1) * 60 + (+m1), end = (+h2) * 60 + (+m2);
    if (end > start ? mins >= start && mins < end : mins >= start || mins < end) return true;
  }
  return matchedAnyRule ? false : null;
}

// ── Outdoor detail lines — only what OSM actually tags (honest, no guessing) ──
// Hiking/cycling routes carry distance/difficulty; peaks & huts carry elevation.
const SAC_SCALE: Record<string, string> = {
  hiking: 'Easy', mountain_hiking: 'Moderate', demanding_mountain_hiking: 'Challenging',
  alpine_hiking: 'Difficult', demanding_alpine_hiking: 'Very difficult', difficult_alpine_hiking: 'Expert',
};
const MTB_SCALE = ['Easy', 'Easy+', 'Moderate', 'Challenging', 'Difficult', 'Very difficult', 'Expert'];

function outdoorExtras(tags: Record<string, string>): string[] {
  const out: string[] = [];
  // Distance (routes) — OSM stores km, sometimes with a unit suffix.
  const distRaw = tags.distance ?? '';
  const distNum = parseFloat(distRaw.replace(',', '.'));
  if (Number.isFinite(distNum) && distNum > 0) out.push(`📏 ${distNum % 1 ? distNum.toFixed(1) : distNum} km`);
  // Difficulty — hiking (sac_scale) or mountain-biking (mtb:scale 0–6).
  const sac = tags.sac_scale ?? '';
  const mtb = tags['mtb:scale'] ?? '';
  const diff = SAC_SCALE[sac]
    ?? (mtb !== '' && Number.isFinite(+mtb) ? MTB_SCALE[Math.min(+mtb, 6)] : '')
    ?? '';
  if (diff) out.push(`🥾 ${diff}`);
  // Elevation (peaks, mountain huts).
  const ele = parseFloat(tags.ele ?? '');
  if (Number.isFinite(ele) && ele > 0 && (tags.natural === 'peak' || tags.natural === 'volcano' || tags.tourism === 'alpine_hut'))
    out.push(`⛰️ ${Math.round(ele)} m elevation`);
  // Ascent/descent if present (routes).
  const asc = parseFloat(tags.ascent ?? '');
  if (Number.isFinite(asc) && asc > 0) out.push(`📈 ${Math.round(asc)} m ascent`);
  return out;
}

export async function overpassToPost(
  el: OverpassElement, city: string, category: string, description: string,
  tryRealPhoto = false
): Promise<ApiPost> {
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
  const kind    = placeKind(tags);

  // Caption: a free, tag-written description (no LLM) unless the caller supplied one.
  const desc = description && description.trim() ? description : describePlace(tags, city, el.id);

  // A photo OF THIS PLACE, best source first:
  //   0. Wikimedia gallery for landmarks linked to Wikidata (swipeable) →
  //   1. OSM's own image/wikimedia tag → 2. Google Places (gated) →
  //   3. the venue's own og:image → 4. no photo.
  //
  // There is no step 5. The old one asked Unsplash/Pexels for the CATEGORY
  // ("cozy restaurant interior") and fell through to picsum, so a place with no
  // photo of its own was handed someone else's — the same twenty photos shared
  // out across every restaurant in every city. An honest empty state (a designed
  // cover from `PostImage`) beats a photo of a room this place has never seen.
  let image: string | null = osmTagImage(tags);
  let images: string[] | undefined;

  // Landmarks/parks/peaks linked to a Wikidata entity get a real, multi-photo
  // Wikimedia gallery — the same treatment sightseeing POIs get. Time-boxed
  // inside the fetch so it never stalls a page.
  if (tryRealPhoto && tags.wikidata) {
    const gallery = await fetchCommonsImagesByWikidata(tags.wikidata).catch(() => []);
    if (gallery.length >= 2) {
      images = gallery;
      image = gallery[0];
    } else if (gallery.length === 1 && !image) {
      image = gallery[0];
    }
  }

  if (image && image.includes('upload.wikimedia.org')) image = proxyImage(image);
  if (!image && tryRealPhoto) {
    image = await fetchGooglePlacePhoto(name, elLat, elLng);
  }
  if (!image && tryRealPhoto && website) {
    image = await fetchOgImage(website);
    if (image) image = proxyImage(image);
  }

  const osmUrl = `https://www.openstreetmap.org/${el.type}/${el.id}`;
  const isFoodCat = category === 'restaurants' || category === 'food';
  const open = openNow(hours);
  const extras = [
    cuisine && isFoodCat ? `🍴 ${cuisine.charAt(0).toUpperCase()}${cuisine.slice(1)} cuisine` : '',
    stars && category === 'hotels' ? `⭐ ${stars}-star` : '',
    ...(category === 'outdoors' ? outdoorExtras(tags) : []),
    open === true ? '🟢 Open now' : open === false ? '🔴 Closed now' : '',
    hours ? `⏰ ${hours}` : '',
    phone ? `📞 ${phone}` : '',
  ].filter(Boolean).map(l => `\n${l}`).join('');

  return {
    id: `osm_${el.id}`,
    user: makeUser(name, domain || undefined),
    image: image ?? '',
    images,
    caption: `${desc}\n\n${kind.emoji} ${name}${addr ? `\n📍 ${addr}, ${city}` : `\n📍 ${city}`}${extras}${website ? `\n🔗 ${website}` : `\n🗺️ ${osmUrl}`}`,
    likes: 0,
    comments: 0,
    category,
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
