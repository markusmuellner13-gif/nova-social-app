// Overpass (OpenStreetMap) — real shops, venues, restaurants, hotels, rentals
// around the user. No API key. Place posts use the venue's own og:image when
// its website provides one, so photos show the actual place, not stock.

import { ApiPost, makeUser, getImage, picsumUrl, proxyImage } from './shared';

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

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

export async function fetchOverpassPlaces(lat: number, lng: number, category: string, radiusM: number): Promise<OverpassElement[]> {
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

export async function overpassToPost(
  el: OverpassElement, city: string, category: string, description: string,
  unsplashKey?: string, pexelsKey?: string, tryOgImage = false
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

  const IMG_QUERIES: Record<string, string> = {
    shops:       'vintage thrift store interior clothing racks',
    venues:      'concert hall theatre interior stage lights',
    restaurants: cuisine ? `${cuisine} restaurant food dish` : 'cozy restaurant interior dinner table',
    food:        cuisine ? `${cuisine} restaurant food dish` : 'delicious food dish restaurant table',
    hotels:      'elegant hotel room interior design',
    rentals:     'bicycle car rental shop city',
  };
  const imgQ = IMG_QUERIES[category] ?? `${category} place interior`;

  // Real photo from the venue's own website when available, else stock
  let image: string | null = null;
  if (tryOgImage && website) {
    image = await fetchOgImage(website);
    if (image) image = proxyImage(image);
  }
  if (!image) {
    image = await Promise.race([
      getImage(imgQ, unsplashKey, pexelsKey, `osm_${el.id}`),
      new Promise<string>(resolve => setTimeout(() => resolve(picsumUrl(`osm_${el.id}`)), 3000)),
    ]);
  }

  const typeLabel: Record<string, string> = { shops: '🛍️', venues: '🎭', community: '🤝', restaurants: '🍽️', food: '🍽️', hotels: '🏨', rentals: '🚲' };
  const osmUrl = `https://www.openstreetmap.org/${el.type}/${el.id}`;

  const isFoodCat = category === 'restaurants' || category === 'food';
  const extras = [
    cuisine && isFoodCat ? `🍴 ${cuisine.charAt(0).toUpperCase()}${cuisine.slice(1)} cuisine` : '',
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
