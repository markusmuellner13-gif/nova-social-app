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

// ── Sightseeing quality gate ─────────────────────────────────────────────────
// Wikipedia GeoSearch returns EVERY nearby article — including the local train
// station, bus depot, motorway junction, electrical substation and primary
// school. None of those are "sightseeing". We drop that infrastructure noise so
// the feed leads with things actually worth seeing (landmarks, churches,
// castles, museums, monuments, parks), not the railway halt in the next village.
//
// Multilingual: Wikipedia titles come back in the local language too, so we
// match German/French/Italian/Spanish station words alongside English.
const TRANSIT_NOISE = [
  'train station', 'railway station', 'metro station', 'subway station',
  'bus station', 'bus stop', 'tram stop', 'tram station', 'transit', 'depot',
  'bahnhof', 'hauptbahnhof', 'haltestelle', 'gare de', 'gare du', 'gare ', 'stazione di',
  'estación de', 'estació', 'u-bahn', 's-bahn', 'park and ride', 'park & ride',
  'interchange', 'junction', 'roundabout', 'motorway', 'autobahn', 'autoroute',
  'highway', 'flyover', 'overpass', 'underpass', 'car park', 'parking',
  'power station', 'power plant', 'substation', 'sewage', 'wastewater',
  'water tower', 'reservoir', 'landfill', 'industrial estate', 'business park',
  'primary school', 'secondary school', 'high school', 'grammar school',
  'kindergarten', 'hospital', 'clinic', 'fire station', 'police station',
  'post office', 'electoral', 'constituency', 'census-designated',
  'list of', '(disambiguation)', 'roundhouse', 'marshalling yard',
];

// A handful of stations ARE world-class sightseeing — cathedrals of transit.
// These survive the transit filter (matched loosely on the distinctive part of
// the name) so a genuinely beautiful station still shows up.
const FAMOUS_STATIONS = [
  'grand central', 'st pancras', 'st. pancras', 'antwerpen-centraal', 'antwerp central',
  'liège-guillemins', 'gare de strasbourg', 'helsinki central', 'kanazawa station',
  'tokyo station', 'chhatrapati shivaji', 'victoria terminus', 'são bento',
  'atocha', 'milano centrale', 'flinders street', 'dunedin railway',
  'sirkeci', 'haydarpaşa', 'haydarpasa', 'kuala lumpur railway', 'gare de lyon',
  'gare du nord', 'maputo railway', 'zürich hauptbahnhof', 'zurich hauptbahnhof',
];

export function isWorthSightseeing(title: string): boolean {
  const t = title.toLowerCase();
  if (FAMOUS_STATIONS.some(f => t.includes(f))) return true;
  return !TRANSIT_NOISE.some(n => t.includes(n));
}

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
  // Quality gate: keep real sights, drop train stations / infrastructure noise.
  return (d.query?.geosearch ?? []).filter(p => isWorthSightseeing(p.title));
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
