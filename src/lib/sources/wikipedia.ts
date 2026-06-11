// Wikipedia — real sightseeing POIs with real photos (free, no key).
// Deep pages shift the search centre outward in a ring so the stream keeps
// going after the first 50 nearby articles are exhausted.

import { ApiPost, makeUser, getImage, proxyImage } from './shared';

export interface WikiGeoResult {
  pageid: number;
  title: string;
  lat: number;
  lon: number;
  dist: number;
}

export interface WikiSummary {
  title: string;
  description?: string;
  extract?: string;
  thumbnail?: { source: string };
  content_urls?: { desktop?: { page?: string } };
}

const WIKI_HEADERS = {
  'User-Agent': 'Nova-App/2.0 (contact@nova-app.com)',
  'Api-User-Agent': 'Nova-App/2.0 (contact@nova-app.com)',
};

// Ring offsets (~8km per step) used when the central search is exhausted:
// ring 0 = user position, rings 1+ move N/E/S/W then diagonals.
const RING_OFFSETS: [number, number][] = [
  [0, 0],
  [0.08, 0], [0, 0.11], [-0.08, 0], [0, -0.11],
  [0.08, 0.11], [-0.08, 0.11], [-0.08, -0.11], [0.08, -0.11],
];

export async function fetchWikipediaNearby(lat: number, lng: number, radiusM: number, ring = 0): Promise<WikiGeoResult[]> {
  const [dLat, dLng] = RING_OFFSETS[Math.min(ring, RING_OFFSETS.length - 1)];
  const r = Math.min(Math.max(radiusM, 1000), 10000); // Wikipedia max: 10000m
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat + dLat}|${lng + dLng}&gsradius=${r}&gslimit=50&format=json&origin=*`;
  const res = await fetch(url, { headers: WIKI_HEADERS, signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Wikipedia GeoSearch ${res.status}`);
  const d = await res.json() as { query?: { geosearch?: WikiGeoResult[] } };
  return d.query?.geosearch ?? [];
}

export async function fetchWikipediaSummary(title: string): Promise<WikiSummary | null> {
  try {
    const encoded = encodeURIComponent(title.replace(/ /g, '_'));
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
      { headers: WIKI_HEADERS, signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return null;
    return await res.json() as WikiSummary;
  } catch { return null; }
}

export async function wikiToPost(
  poi: WikiGeoResult, summary: WikiSummary | null, desc: string, city: string,
  unsplashKey?: string, pexelsKey?: string
): Promise<ApiPost> {
  const wikiImg = summary?.thumbnail?.source;
  const wikiUrl = summary?.content_urls?.desktop?.page
    ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(poi.title.replace(/ /g, '_'))}`;

  // Prefer Wikipedia's own image (proxied); fall back to Unsplash/Pexels/picsum
  const image = wikiImg
    ? proxyImage(wikiImg)
    : await getImage(`${poi.title} ${city} landmark`, unsplashKey, pexelsKey, `wiki_${poi.pageid}`);

  return {
    id: `wiki_${poi.pageid}`,
    user: makeUser(poi.title),
    image,
    caption: `${desc}\n\n🏛️ ${summary?.description ?? 'Landmark'}\n📍 ${poi.title}, ${city}\n📏 ${Math.round(poi.dist)}m from centre\n🔗 Learn more: ${wikiUrl}`,
    likes: 0,
    comments: 0,
    category: 'sightseeing',
    hashtags: [`#${city.replace(/\s/g, '')}`, '#sightseeing', '#nova', '#travel', '#landmark'],
    timestamp: Date.now() - Math.random() * 86_400_000,
    location: { name: `${poi.title}, ${city}`, lat: poi.lat, lng: poi.lon },
    saved: false, liked: false,
    isEvent: false, isAIGenerated: false,
    eventUrl: wikiUrl,
    organizer: poi.title,
  };
}
