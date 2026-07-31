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
  // The full-resolution source of that thumbnail. `thumbnail` is only ~330px
  // wide — nowhere near enough for a full-bleed card on a modern phone — while
  // `originalimage` is the real photo (often 2000–4000px). We lead with the
  // original and let the image proxy render it down to the size actually needed.
  originalimage?: { source: string; width?: number; height?: number };
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
  // These are geotagged at the city centre, so they crowd out real landmarks:
  // a trip briefing for Rome was opening with "Municipio I", "Municipio XII"
  // and "Metropolitan City of Rome Capital" before any actual sight.
  // Multilingual, because Wikipedia titles come back in the local language.
  ' district', '(district)', 'municipality', 'province of', 'prefecture',
  'metropolitan area', 'metropolitan city', 'administrative', 'cadastral', 'statutory city',
  'municipio', 'comune di', 'circoscrizione', 'frazione',
  'arrondissement', 'communauté de communes', 'canton of',
  'distrito', 'municipio de', 'comarca', 'gemeinde', 'ortsteil', 'stadtbezirk',
  'gemeente', 'deelgemeente', 'borough of', 'civil parish', 'ward of',
  'regional unit', 'subprefecture', 'administrative region',
  // Historical events and abstract topics. Wikipedia geotags these because the
  // battle/treaty happened at those coordinates, so GeoSearch happily returns
  // "Siege of Vienna" and "Timeline of Vienna" as things near you — but you
  // cannot go and look at a siege. Real monuments commemorating them have their
  // own articles ("Heldenplatz", "Pummerin") and are unaffected.
  'siege of', 'battle of', 'timeline of', 'history of', 'treaty of',
  'congress of', 'massacre', 'uprising', 'revolution of', 'election',
  'archdiocese', 'diocese of', 'demographics', 'economy of', 'culture of',
  'outline of', 'index of', 'bibliography',
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

// An article about something that HAPPENED rather than somewhere you can go.
// Wikipedia geotags these at the place they happened, so a sightseeing search
// for Rome offered "Fall of Rome (1849)" and "1932 UCI Road World
// Championships" as things to visit — and the crowd advice then recommended
// them as quieter alternatives, which is nonsense.
//   • a title starting with a year        → "1932 UCI Road World Championships"
//   • a title ending in a bare year        → "Fall of Rome (1849)"
//   • named recurring sporting occasions
const HISTORICAL_EVENT = /^\s*\d{3,4}[\s–-]|\(\d{4}\)\s*$|\b(championships?|olympic|world cup|grand prix|expo \d|festival of \d|congress \d)\b/i;

// Historical polities and episodes. Same problem, different flavour: Wikipedia
// geotags "Principality of Catalonia" and "¡Cu-Cut! incident" in Barcelona, and
// a tourist cannot visit either of them.
const HISTORICAL_ENTITY = /\b(principality|kingdom of|republic of|duchy|county of|crown of|dynasty|incident|affair|scandal|crisis|revolt|riot|rebellion|conspiracy|plot of|proclamation|manifesto)\b/i;

export function isWorthSightseeing(title: string, city?: string): boolean {
  const t = title.toLowerCase();
  if (FAMOUS_STATIONS.some(f => t.includes(f))) return true;
  if (HISTORICAL_EVENT.test(title) || HISTORICAL_ENTITY.test(title)) return false;
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
      // srcset is ordered smallest-first (1× then 2×). Take the LARGEST entry
      // Wikimedia actually publishes — the old code took `[0]` (the 1× render,
      // often 500px) and then blindly rewrote the width to 800px, which 400s for
      // every file whose original is narrower than that. That is why sightseeing
      // galleries were silently falling back to random stock photos.
      const src = (it.srcset ?? []).at(-1)?.src ?? it.srcset?.[0]?.src;
      if (!src) continue;
      const full = src.startsWith('//') ? `https:${src}` : src;
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

// ── Real photos for an OSM place that carries a `wikidata` tag ─────────────────
// Thousands of churches, castles, museums, parks, peaks and natural landmarks in
// OpenStreetMap are linked to a Wikidata entity (a Q-id). We read that entity's
// designated image (P18) and, when it has an English Wikipedia article, pull
// that article's full photo set too — giving outdoors & OSM places the same
// swipeable Wikimedia gallery the sightseeing tab already enjoys. Free, no key.
export async function fetchCommonsImagesByWikidata(qid: string, max = 6): Promise<string[]> {
  if (!/^Q\d+$/.test(qid)) return [];
  try {
    const res = await fetch(
      `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
      { headers: WIKI_HEADERS, signal: AbortSignal.timeout(3500) }
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      entities?: Record<string, {
        claims?: { P18?: { mainsnak?: { datavalue?: { value?: string } } }[] };
        sitelinks?: Record<string, { title?: string }>;
      }>;
    };
    const entity = data.entities?.[qid];
    if (!entity) return [];

    const urls: string[] = [];
    const seen = new Set<string>();
    const skip = /\.svg|icon|logo|symbol|flag|map|locator|seal|coat[_ ]of[_ ]arms/i;
    const pushFile = (file: string) => {
      const key = file.toLowerCase();
      if (!file || seen.has(key) || skip.test(key)) return;
      seen.add(key);
      // Special:FilePath redirects to upload.wikimedia.org and is served fine as
      // a plain <img> src (CSP allows https: images); consistent with osmTagImage.
      urls.push(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1600`);
    };

    // P18 — the entity's designated image(s).
    for (const c of entity.claims?.P18 ?? []) {
      const file = c.mainsnak?.datavalue?.value;
      if (typeof file === 'string') pushFile(file);
    }

    // Merge in the English Wikipedia article's photo set for a fuller gallery.
    const enTitle = entity.sitelinks?.enwiki?.title;
    if (enTitle && urls.length < max) {
      const wikiImgs = await fetchWikipediaImages(enTitle, max).catch(() => []);
      for (const u of wikiImgs) {
        const key = (u.split('/').pop() ?? u).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        urls.push(u);
        if (urls.length >= max) break;
      }
    }
    return urls.slice(0, max);
  } catch {
    return [];
  }
}

export async function wikiToPost(
  poi: WikiGeoResult, summary: WikiSummary | null, desc: string, city: string,
  unsplashKey?: string, pexelsKey?: string
): Promise<ApiPost> {
  // Prefer the article's ORIGINAL photo over the 330px REST thumbnail.
  const wikiImg = summary?.originalimage?.source ?? summary?.thumbnail?.source;
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
    // A card whose first line is blank reads as broken, and some Wikipedia
    // articles genuinely have no extract. Fall back through the article's own
    // one-line description to the title itself, so there is always a headline.
    caption: `${
      desc?.trim()
      || summary?.extract?.trim()
      || (summary?.description ? `${poi.title} — ${summary.description}` : '')
      || `${poi.title}, a landmark in ${city}.`
    }\n\n🏛️ ${summary?.description ?? 'Landmark'}\n📍 ${poi.title}, ${city}\n📏 ${Math.round(poi.dist)}m from centre\n🔗 Learn more: ${wikiUrl}`,
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
