// ─────────────────────────────────────────────────────────────────────────────
// Nova's OWN web-reading engine — "Nova AI" crawler.
//
// This is a FREE, self-hosted alternative to paying for an LLM web search on
// every fetch. It reads real web pages and extracts genuine events from the
// schema.org / JSON-LD structured data that most event sites embed — exactly the
// machine-readable data search engines use. No API key, no per-call credits.
//
// Pipeline:  build candidate URLs for a city+category  →  fetch the HTML  →
//            pull every <script type="application/ld+json"> block  →  walk it
//            for Event-typed objects (incl. @graph / ItemList / nested item) →
//            normalise to the app's ApiPost shape.
//
// Everything is best-effort and fail-soft: a blocked or structure-less site just
// yields nothing and the next source is tried. Used by /api/feed as a free
// fallback when the keyed sources are sparse, and by the ingestion cron to grow
// the events DB without spending credits.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiPost, makeUser, picsumUrl, slugify, todayStr, haversineKm, fetchOgImage, proxyImage } from './shared';
import { validateBatch } from '@/lib/eventValidation';

// The schema.org Event subtypes we treat as real events.
const EVENT_TYPES = new Set([
  'Event', 'MusicEvent', 'TheaterEvent', 'DanceEvent', 'Festival', 'SportsEvent',
  'ExhibitionEvent', 'ScreeningEvent', 'ComedyEvent', 'EducationEvent', 'FoodEvent',
  'SocialEvent', 'BusinessEvent', 'ChildrensEvent', 'LiteraryEvent', 'VisualArtsEvent',
  'PublicationEvent', 'SaleEvent', 'CourseInstance', 'EventSeries',
]);

export interface CrawledEvent {
  name: string;
  description: string;
  startDate: string;      // raw ISO-ish string from the page
  endDate?: string;
  url: string;
  image?: string;
  venue?: string;
  street?: string;
  locality?: string;      // venue city/town from structured data
  region?: string;
  country?: string;
  lat?: number;
  lng?: number;
  price?: string;
  currency?: string;
  organizer?: string;
}

// ── JSON-LD walking ──────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

function typeMatches(t: unknown): boolean {
  if (typeof t === 'string') return EVENT_TYPES.has(t);
  if (Array.isArray(t)) return t.some(x => typeof x === 'string' && EVENT_TYPES.has(x));
  return false;
}

function firstString(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) { for (const x of v) { const s = firstString(x); if (s) return s; } }
  if (v && typeof v === 'object') {
    const o = v as Json;
    if (typeof o.url === 'string') return o.url;
    if (typeof o.name === 'string') return o.name;
    if (typeof o['@value'] === 'string') return o['@value'] as string;
  }
  return undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') { const n = parseFloat(v); if (Number.isFinite(n)) return n; }
  return undefined;
}

function extractPrice(offers: unknown): { price?: string; currency?: string } {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  let min = Infinity; let currency: string | undefined; let free = false;
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    const oo = o as Json;
    const p = num(oo.price) ?? num(oo.lowPrice);
    if (typeof oo.priceCurrency === 'string') currency = oo.priceCurrency;
    if (p !== undefined) { if (p === 0) free = true; if (p < min) min = p; }
  }
  if (free && min === 0) return { price: 'Free', currency };
  if (Number.isFinite(min)) return { price: `${currency ?? ''} ${min}`.trim(), currency };
  return {};
}

function nodeToEvent(node: Json): CrawledEvent | null {
  if (!typeMatches(node['@type'])) return null;
  const name = firstString(node.name);
  const startDate = firstString(node.startDate);
  if (!name || !startDate) return null;

  const loc = node.location as Json | Json[] | undefined;
  const locObj = (Array.isArray(loc) ? loc[0] : loc) as Json | undefined;
  const addr = locObj?.address as Json | undefined;
  const geo = locObj?.geo as Json | undefined;
  const offers = extractPrice(node.offers);
  const organizer = firstString(node.organizer);

  let image = firstString(node.image);
  if (image && image.startsWith('//')) image = `https:${image}`;

  return {
    name: name.slice(0, 200),
    description: (firstString(node.description) ?? '').slice(0, 500),
    startDate,
    endDate: firstString(node.endDate),
    url: firstString(node.url) ?? '',
    image,
    venue: firstString(locObj?.name),
    street: typeof addr?.streetAddress === 'string' ? addr.streetAddress : undefined,
    locality: typeof addr?.addressLocality === 'string' ? addr.addressLocality
            : typeof addr === 'string' ? addr : undefined,
    region: typeof addr?.addressRegion === 'string' ? addr.addressRegion : undefined,
    country: typeof addr?.addressCountry === 'string' ? addr.addressCountry
           : firstString((addr?.addressCountry as Json)?.name),
    lat: num(geo?.latitude),
    lng: num(geo?.longitude),
    price: offers.price,
    currency: offers.currency,
    organizer,
  };
}

// Recursively collect Event nodes from any JSON-LD value: handles bare objects,
// arrays, @graph containers and ItemList → itemListElement → item nesting.
function collect(value: unknown, out: CrawledEvent[], depth = 0): void {
  if (!value || depth > 6) return;
  if (Array.isArray(value)) { for (const v of value) collect(v, out, depth + 1); return; }
  if (typeof value !== 'object') return;
  const obj = value as Json;

  const ev = nodeToEvent(obj);
  if (ev) out.push(ev);

  if (obj['@graph']) collect(obj['@graph'], out, depth + 1);
  if (obj.itemListElement) collect(obj.itemListElement, out, depth + 1);
  if (obj.item) collect(obj.item, out, depth + 1);
  if (obj.subEvent) collect(obj.subEvent, out, depth + 1);
  if (obj.events) collect(obj.events, out, depth + 1);
}

// Pull and parse every JSON-LD block in a page and return the events inside.
export function extractEventsFromHtml(html: string): CrawledEvent[] {
  const out: CrawledEvent[] = [];
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of blocks) {
    const jsonText = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    if (!jsonText) continue;
    try {
      collect(JSON.parse(jsonText), out);
    } catch {
      // Some sites concatenate multiple objects or include trailing commas.
      // Best-effort: try to salvage individual {...} chunks.
      for (const m of jsonText.match(/\{[\s\S]*?\}(?=\s*[,\]]|\s*$)/g) ?? []) {
        try { collect(JSON.parse(m), out); } catch { /* skip */ }
      }
    }
  }
  return out;
}

// ── City normalisation (drop big-city spill onto a small town's page) ─────────

const CITY_ALIASES: Record<string, string> = {
  wien: 'vienna', vienna: 'vienna', muenchen: 'munich', munchen: 'munich', munich: 'munich',
  koeln: 'cologne', koln: 'cologne', cologne: 'cologne', praha: 'prague', prague: 'prague',
  roma: 'rome', rome: 'rome', firenze: 'florence', florence: 'florence', venezia: 'venice',
  venice: 'venice', napoli: 'naples', naples: 'naples', milano: 'milan', milan: 'milan',
  torino: 'turin', turin: 'turin', graz: 'graz', linz: 'linz', salzburg: 'salzburg',
  innsbruck: 'innsbruck', berlin: 'berlin', hamburg: 'hamburg', frankfurt: 'frankfurt',
  zurich: 'zurich', zuerich: 'zurich', london: 'london', paris: 'paris', barcelona: 'barcelona',
  madrid: 'madrid', amsterdam: 'amsterdam', budapest: 'budapest', lisbon: 'lisbon',
  lisboa: 'lisbon', dublin: 'dublin',
};

function normCity(s: string): string {
  const n = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  return CITY_ALIASES[n] ?? n;
}

function isDifferentMajorCity(venueCity: string, searchCity: string): boolean {
  const v = normCity(venueCity);
  const known = v in CITY_ALIASES || Object.values(CITY_ALIASES).includes(v);
  if (!v || !known) return false;
  return v !== normCity(searchCity);
}

// ── Source URL builders (worldwide, no key) ───────────────────────────────────
// We only crawl sites that actually embed schema.org Event JSON-LD in the HTML
// they serve to a plain server fetch (many event sites render their listings
// client-side in JS, or 403 a non-browser — those are useless to us and are
// deliberately NOT used). Verified working server-side:
//   • bandsintown.com/c/<city>-<country>  → dozens of real concerts/gigs with
//     names, dates, venues and geo. Concert-focused, worldwide, no key.
// Eventbrite is already crawled by its own dedicated source module (also real
// JSON-LD), so the feed gets two independent free web sources. Each builder
// returns 0+ URLs; per-URL failures are ignored.

// Categories where a live-music/concert crawl is genuinely on-topic — so a
// concert is never mislabelled as e.g. "art".
const MUSIC_LIKE = new Set(['music', 'events', 'discover']);

function buildSourceUrls(city: string, country: string, category: string): string[] {
  const citySlug = slugify(city);
  if (!citySlug) return [];
  const urls: string[] = [];

  // bandsintown — concerts & live music by city (real Event JSON-LD server-side)
  if (MUSIC_LIKE.has(category)) {
    const countrySlug = slugify(country);
    urls.push(`https://www.bandsintown.com/c/${citySlug}${countrySlug ? `-${countrySlug}` : ''}`);
  }

  return urls;
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
};

async function fetchHtml(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

// ── Map a crawled event → the app's ApiPost shape ─────────────────────────────

function toApiPost(
  ev: CrawledEvent, idx: number, searchCity: string, searchCountry: string,
  fallbackLat: number, fallbackLng: number, category: string,
): ApiPost | null {
  const rawDate = (ev.startDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return null;
  if (rawDate < todayStr()) return null;

  const evCity = ev.locality || searchCity;
  if (ev.locality && isDifferentMajorCity(ev.locality, searchCity)) return null;

  // Use the event's own coordinates when the page provided them (precise pins!),
  // otherwise fall back to the search-city centroid like the other sources.
  const hasGeo = typeof ev.lat === 'number' && typeof ev.lng === 'number'
    && Math.abs(ev.lat) <= 90 && Math.abs(ev.lng) <= 180 && (ev.lat !== 0 || ev.lng !== 0);
  const lat = hasGeo ? ev.lat! : fallbackLat;
  const lng = hasGeo ? ev.lng! : fallbackLng;

  const time = ev.startDate.length > 10 ? ev.startDate.slice(11, 16) : '';
  let dateStr = 'Date TBC';
  try {
    dateStr = new Date(`${rawDate}T${time || '00:00'}:00`).toLocaleDateString('en-GB',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch { /* keep TBC */ }

  const venue = ev.venue || evCity;
  const addr = [ev.street, evCity].filter(Boolean).join(', ');
  const price = ev.price || 'See website';
  const url = ev.url || `https://allevents.in/${slugify(searchCity)}`;
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'nova'; } })();
  const desc = ev.description || `${ev.name} in ${evCity}.`;

  return {
    id: `nova_${slugify(ev.name).slice(0, 28)}_${rawDate}_${idx}`,
    user: makeUser(ev.organizer || venue, host),
    image: ev.image || picsumUrl(`nova_${searchCity}_${category}_${idx}`),
    caption: `${desc.slice(0, 320)}\n\n📅 ${dateStr}${time ? ` · ${time}` : ''}\n📍 ${venue}${addr ? `, ${addr}` : ''}\n🎟️ ${price}\n🔗 Tickets & info: ${url}`,
    likes: 0,
    comments: 0,
    category: category === 'discover' ? 'events' : category,
    hashtags: [`#${evCity.replace(/\s/g, '')}`, `#${category}`, '#nova', '#local'],
    timestamp: Date.now() - Math.random() * 7_200_000,
    location: { name: `${venue}, ${evCity}`, lat, lng },
    saved: false, liked: false,
    isEvent: true, isAIGenerated: false,
    eventDate: `${dateStr}${time ? ` · ${time}` : ''}`,
    eventDateRaw: rawDate,
    eventVenue: `${venue}${addr ? `, ${addr}` : ''}`,
    eventUrl: url,
    organizer: ev.organizer || venue,
    price,
  };
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function crawlCityEvents(opts: {
  city: string; country: string; lat: number; lng: number;
  category: string; count: number; page: number;
}): Promise<ApiPost[]> {
  const { city, country, lat, lng, category, count } = opts;
  const urls = buildSourceUrls(city, country, category);
  if (urls.length === 0) return [];

  const htmls = await Promise.all(urls.map(u => fetchHtml(u, 7000)));
  const seen = new Set<string>();
  const events: CrawledEvent[] = [];
  for (const html of htmls) {
    if (!html) continue;
    for (const ev of extractEventsFromHtml(html)) {
      const key = `${ev.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40)}|${ev.startDate.slice(0, 10)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(ev);
    }
  }

  let posts: ApiPost[] = [];
  for (let i = 0; i < events.length && posts.length < count; i++) {
    const p = toApiPost(events[i], i, city, country, lat, lng, category);
    if (p) posts.push(p);
  }

  // Quality gate: drop anything corrupt / fake / past / mislocated before it can
  // reach the feed or the DB. maxKm guards against an event page spilling another
  // region's listings stamped at this city's centroid.
  posts = validateBatch(posts, { cityLat: lat, cityLng: lng, maxKm: 150 }).valid;

  // Real photos: for the first few posts that don't already carry a real image,
  // fetch the event page's og:image (the actual event poster/photo). Capped and
  // run in parallel so it never slows the feed much.
  await Promise.all(posts.slice(0, 6).map(async p => {
    const hasReal = p.image && !p.image.includes('picsum.photos');
    if (hasReal || !p.eventUrl || p.eventUrl === '#') return;
    const og = await fetchOgImage(p.eventUrl, 3500);
    if (og) p.image = proxyImage(og);
  }));

  // Sort soonest-first; prefer events with real geo near the search point.
  return posts.sort((a, b) => {
    const da = a.eventDateRaw ?? '9999', db = b.eventDateRaw ?? '9999';
    if (da !== db) return da < db ? -1 : 1;
    const ga = haversineKm(lat, lng, a.location.lat, a.location.lng);
    const gb = haversineKm(lat, lng, b.location.lat, b.location.lng);
    return ga - gb;
  });
}
