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
  // Administrative-area articles aren't "a sight" — drop the Bezirk/county/etc.
  ' district', '(district)', 'municipality', 'province of', 'prefecture',
  'metropolitan area', 'administrative', 'cadastral', 'statutory city',
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

// A Wikipedia article ABOUT a populated place (a neighbouring village/town/
// suburb) is not a sight — it's just the place. Detected from the article's own
// one-line description ("municipality in Lower Austria", "village in…"), which is
// a far more reliable signal than the bare title. Returns true → should be
// dropped from the sightseeing feed.
const SETTLEMENT_DESC = /\b(municipality|town|village|hamlet|suburb|borough|commune|locality|cadastral|civil parish|market town|populated place|settlement|district|county|province|region|state capital|metropolis)\b/i;
// …but a description that ALSO names a real sight type should survive (e.g. a
// "village church", a "castle in the town of…").
const SIGHT_DESC = /\b(church|cathedral|basilica|chapel|abbey|monastery|castle|palace|fortress|ruins?|tower|gate|monument|memorial|museum|gallery|palace|theatre|opera|bridge|park|garden|square|spa|baths?|fountain|statue|landmark|viewpoint|lake|waterfall|cave|vineyard|winery|sight|attraction)\b/i;

export function isSettlementArticle(description: string | null | undefined): boolean {
  if (!description) return false;
  return SETTLEMENT_DESC.test(description) && !SIGHT_DESC.test(description);
}

export function isWorthSightseeing(title: string, city?: string): boolean {
  const t = title.toLowerCase();
  if (FAMOUS_STATIONS.some(f => t.includes(f))) return true;
  if (TRANSIT_NOISE.some(n => t.includes(n))) return false;
  // The article ABOUT the town/district itself ("Baden", "Baden bei Wien",
  // "Baden, Lower Austria") is not a sight inside that town — drop it. We only
  // treat the city name as the whole first token followed by a disambiguation
  // suffix (" bei …", a comma, or a bracket), so a real venue that merely starts
  // with the city's name ("Baden Casino") is kept.
  if (city) {
    const c = city.trim().toLowerCase();
    if (c && (t === c || new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( bei |,|\\s*\\()`).test(t))) {
      return false;
    }
  }
  return true;
}

// Ring offsets (~8km per step) used when the central search is exhausted:
// ring 0 = user position, rings 1+ move N/E/S/W then diagonals.
const RING_OFFSETS: [number, number][] = [
  [0, 0],
  [0.08, 0], [0, 0.11], [-0.08, 0], [0, -0.11],
  [0.08, 0.11], [-0.08, 0.11], [-0.08, -0.11], [0.08, -0.11],
];

export async function fetchWikipediaNearby(lat: number, lng: number, radiusM: number, ring = 0, city = ''): Promise<WikiGeoResult[]> {
  const [dLat, dLng] = RING_OFFSETS[Math.min(ring, RING_OFFSETS.length - 1)];
  const r = Math.min(Math.max(radiusM, 1000), 10000); // Wikipedia max: 10000m
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat + dLat}|${lng + dLng}&gsradius=${r}&gslimit=50&format=json&origin=*`;
  const res = await fetch(url, { headers: WIKI_HEADERS, signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Wikipedia GeoSearch ${res.status}`);
  const d = await res.json() as { query?: { geosearch?: WikiGeoResult[] } };
  // Quality gate: keep real sights, drop train stations / infrastructure noise
  // and the article about the town/district itself.
  return (d.query?.geosearch ?? []).filter(p => isWorthSightseeing(p.title, city));
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

// ── Multiple real photos of a landmark (free, from Wikimedia) ─────────────────
// The REST media-list endpoint returns every image used on the article. We keep
// the real photos (skip SVG logos/icons/maps), upscale the thumbnails, and proxy
// them — giving a sightseeing post a genuine swipeable gallery instead of one shot.
export async function fetchWikipediaImages(title: string, max = 6): Promise<string[]> {
  try {
    const encoded = encodeURIComponent(title.replace(/ /g, '_'));
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/media-list/${encoded}`,
      { headers: WIKI_HEADERS, signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return [];
    const d = await res.json() as {
      items?: { type?: string; title?: string; srcset?: { src?: string }[] }[];
    };
    const urls: string[] = [];
    const seen = new Set<string>();
    for (const it of d.items ?? []) {
      if (it.type !== 'image') continue;
      const fileTitle = (it.title ?? '').toLowerCase();
      // Skip vector logos, icons, maps, flags and other non-photo chrome.
      if (/\.svg|icon|logo|symbol|flag|map|locator|wiki|commons-|edit-|seal|coat[_ ]of[_ ]arms/i.test(fileTitle)) continue;
      const src = it.srcset?.[0]?.src;
      if (!src) continue;
      let full = src.startsWith('//') ? `https:${src}` : src;
      full = full.replace(/\/\d+px-/, '/800px-'); // request a larger render
      const key = full.split('/').pop() ?? full;
      if (seen.has(key)) continue;
      seen.add(key);
      urls.push(proxyImage(full));
      if (urls.length >= max) break;
    }
    return urls;
  } catch {
    return [];
  }
}

export async function wikiToPost(
  poi: WikiGeoResult, summary: WikiSummary | null, desc: string, city: string,
  unsplashKey?: string, pexelsKey?: string
): Promise<ApiPost> {
  const wikiImg = summary?.thumbnail?.source;
  const wikiUrl = summary?.content_urls?.desktop?.page
    ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(poi.title.replace(/ /g, '_'))}`;

  // Pull several real photos of the landmark for a swipeable gallery. When the
  // article has 2+ usable photos we lead with them; otherwise fall back to the
  // single summary thumbnail (then Unsplash/Pexels/picsum) — unchanged behaviour.
  const gallery = await fetchWikipediaImages(poi.title).catch(() => []);
  let image: string;
  let images: string[] | undefined;
  if (gallery.length >= 2) {
    images = gallery;
    image = gallery[0];
  } else {
    image = wikiImg
      ? proxyImage(wikiImg)
      : (gallery[0] ?? await getImage(`${poi.title} ${city} landmark`, unsplashKey, pexelsKey, `wiki_${poi.pageid}`));
  }

  return {
    id: `wiki_${poi.pageid}`,
    user: makeUser(poi.title),
    image,
    images,
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
