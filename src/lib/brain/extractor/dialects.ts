// ─────────────────────────────────────────────────────────────────────────────
// The skills Nova ships with.
//
// These are the formats common enough to be worth hand-writing a reader for.
// Anything a page uses that ISN'T one of these is what learn.ts is for.
//
// Each dialect is a pure function (html, payloads, url) → records, so it can be
// unit-tested against a saved page and scored against the others on equal
// terms. They are tried in order; the engine keeps every record they find and
// only invokes the learner when the built-ins come back thin.
// ─────────────────────────────────────────────────────────────────────────────

import type { ExtractedRecord, FieldName, Payload, RecordKind } from './types';
import { harvestMeta } from './harvest';
import { toRecord } from './normalize';
import { isUsableRecord } from './validate';

type Json = Record<string, unknown>;

// schema.org types, grouped by what they mean for a traveller. An @type we
// don't know is ignored rather than guessed at.
const EVENT_TYPES = new Set([
  'Event', 'MusicEvent', 'TheaterEvent', 'DanceEvent', 'Festival', 'SportsEvent',
  'ExhibitionEvent', 'ScreeningEvent', 'ComedyEvent', 'EducationEvent', 'FoodEvent',
  'SocialEvent', 'BusinessEvent', 'ChildrensEvent', 'LiteraryEvent', 'VisualArtsEvent',
  'PublicationEvent', 'SaleEvent', 'CourseInstance', 'EventSeries',
]);

const ATTRACTION_TYPES = new Set([
  'TouristAttraction', 'Museum', 'ArtGallery', 'LandmarksOrHistoricalBuildings',
  'HistoricalLandmark', 'Aquarium', 'Zoo', 'AmusementPark', 'Park', 'Castle',
  'PlaceOfWorship', 'Church', 'Cathedral', 'Mosque', 'Synagogue', 'Temple',
  'PerformingArtsTheater', 'MovieTheater', 'Beach', 'BodyOfWater', 'Mountain',
  'NationalPark', 'CivicStructure', 'TouristDestination', 'ExhibitionEvent',
  'Observatory', 'PlanetariumOrObservatory',
]);

const TOUR_TYPES = new Set([
  'TouristTrip', 'Trip', 'Product', 'Offer', 'Service', 'Reservation', 'BoatTrip',
]);

function typeNames(t: unknown): string[] {
  if (typeof t === 'string') return [t.replace(/^https?:\/\/schema\.org\//i, '')];
  if (Array.isArray(t)) return t.flatMap(typeNames);
  return [];
}

function kindOfType(t: unknown): RecordKind | null {
  const names = typeNames(t);
  if (names.some(n => EVENT_TYPES.has(n)))      return 'event';
  if (names.some(n => ATTRACTION_TYPES.has(n))) return 'attraction';
  if (names.some(n => TOUR_TYPES.has(n)))       return 'tour';
  if (names.includes('Place') || names.includes('LocalBusiness')) return 'place';
  return null;
}

function firstString(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) { for (const x of v) { const s = firstString(x); if (s) return s; } return undefined; }
  if (v && typeof v === 'object') {
    const o = v as Json;
    if (typeof o.name === 'string') return o.name;
    if (typeof o.url === 'string') return o.url;
    if (typeof o['@value'] === 'string') return o['@value'];
    if (typeof o.contentUrl === 'string') return o.contentUrl;
  }
  return undefined;
}

/** schema.org offers → a display price, a currency, and where to buy. */
function readOffers(offers: unknown): { price?: string; currency?: string; ticketUrl?: string } {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  let min = Infinity, currency: string | undefined, ticketUrl: string | undefined, sawFree = false;
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    const oo = o as Json;
    if (Array.isArray(oo.offers) || (oo.offers && typeof oo.offers === 'object')) {
      const nested = readOffers(oo.offers);
      if (nested.ticketUrl && !ticketUrl) ticketUrl = nested.ticketUrl;
      if (nested.currency && !currency) currency = nested.currency;
    }
    const raw = oo.price ?? oo.lowPrice ?? (oo.priceSpecification as Json | undefined)?.price;
    const p = typeof raw === 'string' ? parseFloat(raw) : typeof raw === 'number' ? raw : NaN;
    if (typeof oo.priceCurrency === 'string') currency ??= oo.priceCurrency;
    if (typeof oo.url === 'string') ticketUrl ??= oo.url;
    if (Number.isFinite(p)) { if (p === 0) sawFree = true; if (p < min) min = p; }
  }
  const price = sawFree && min === 0 ? 'Free'
    : Number.isFinite(min) ? `${currency ?? ''} ${min}`.trim()
    : undefined;
  return { price, currency, ticketUrl };
}

/** One schema.org node → our record, if it is a type we care about. */
function nodeToRecord(node: Json, baseUrl?: string): ExtractedRecord | null {
  const kind = kindOfType(node['@type']);
  if (!kind) return null;

  const loc = node.location ?? node.containedInPlace ?? node.itemOffered;
  const locObj = (Array.isArray(loc) ? loc[0] : loc) as Json | undefined;
  const addr = (locObj?.address ?? node.address) as Json | string | undefined;
  const addrObj = typeof addr === 'object' ? addr as Json : undefined;
  const geo = (locObj?.geo ?? node.geo) as Json | undefined;
  const offers = readOffers(node.offers);
  const agg = node.aggregateRating as Json | undefined;

  const vals: Partial<Record<FieldName, unknown>> = {
    name: firstString(node.name) ?? firstString(node.headline),
    description: firstString(node.description) ?? firstString(node.abstract),
    startDate: node.startDate ?? node.validFrom,
    endDate: node.endDate,
    url: firstString(node.url) ?? firstString(node.mainEntityOfPage),
    ticketUrl: offers.ticketUrl,
    image: firstString(node.image) ?? firstString(node.photo) ?? firstString(node.logo),
    venue: firstString(locObj?.name) ?? firstString(node.location),
    street: addrObj?.streetAddress ?? (typeof addr === 'string' ? addr : undefined),
    locality: addrObj?.addressLocality,
    region: addrObj?.addressRegion,
    country: firstString(addrObj?.addressCountry),
    lat: geo?.latitude ?? locObj?.latitude,
    lng: geo?.longitude ?? locObj?.longitude,
    price: offers.price,
    currency: offers.currency,
    rating: agg?.ratingValue,
    duration: firstString(node.duration) ?? firstString(node.timeRequired),
    openingHours: firstString(node.openingHours) ?? firstString(node.openingHoursSpecification),
    organizer: firstString(node.organizer) ?? firstString(node.provider) ?? firstString(node.brand),
  };
  return toRecord(vals, { kind, baseUrl, via: 'ld+json' });
}

/** Walk a JSON-LD document, including @graph / ItemList / subEvent nesting. */
function collectSchema(value: unknown, out: ExtractedRecord[], baseUrl?: string, depth = 0): void {
  if (!value || depth > 7 || out.length > 400) return;
  if (Array.isArray(value)) { for (const v of value) collectSchema(v, out, baseUrl, depth + 1); return; }
  if (typeof value !== 'object') return;
  const obj = value as Json;

  const rec = nodeToRecord(obj, baseUrl);
  if (rec) out.push(rec);

  for (const key of ['@graph', 'itemListElement', 'item', 'subEvent', 'events', 'mainEntity', 'hasPart', 'about']) {
    if (obj[key]) collectSchema(obj[key], out, baseUrl, depth + 1);
  }
}

/** Skill: schema.org JSON-LD. The cleanest source when a site publishes it. */
export function readSchemaOrg(payloads: Payload[], baseUrl?: string): ExtractedRecord[] {
  const out: ExtractedRecord[] = [];
  for (const p of payloads) {
    if (p.source !== 'ld+json') continue;
    collectSchema(p.data, out, baseUrl);
  }
  return out;
}

// ── Microdata ────────────────────────────────────────────────────────────────
// The pre-JSON-LD way of publishing schema.org, still very common on museum and
// municipal sites (which is exactly our sightseeing long tail). Parsed with
// regex over itemprop attributes — no nesting model, so we read one item at a
// time and rely on the validator to drop anything incoherent.

const ITEMSCOPE_RE = /<([a-z0-9]+)\b[^>]*\bitemscope\b[^>]*\bitemtype=["'][^"']*schema\.org\/([A-Za-z]+)["'][^>]*>/gi;

/** Read one attribute out of a tag's attribute string. */
function attr(attrs: string, name: string): string | undefined {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m?.[1];
}

const MICRO_FIELD: Record<string, FieldName> = {
  name: 'name', headline: 'name', description: 'description',
  startdate: 'startDate', enddate: 'endDate', url: 'url', image: 'image',
  streetaddress: 'street', addresslocality: 'locality', addressregion: 'region',
  addresscountry: 'country', latitude: 'lat', longitude: 'lng',
  price: 'price', pricecurrency: 'currency', ratingvalue: 'rating',
  openinghours: 'openingHours', duration: 'duration', organizer: 'organizer',
};

/** Skill: schema.org microdata embedded in the markup. */
export function readMicrodata(html: string, baseUrl?: string): ExtractedRecord[] {
  const out: ExtractedRecord[] = [];
  ITEMSCOPE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = ITEMSCOPE_RE.exec(html)) !== null && guard++ < 200) {
    const kind = kindOfType(m[2]);
    if (!kind) continue;
    // Scan a bounded window after the opening tag — long enough for one card,
    // short enough that we can't swallow the next item whole.
    const window = html.slice(m.index, m.index + 6000);
    const vals: Partial<Record<FieldName, unknown>> = {};
    // Match the WHOLE tag carrying the itemprop, then read its attributes.
    // Doing this with one alternation inside the tag match let the regex prefer
    // the element's text over its href, so `<a itemprop="url" href="…">more</a>`
    // extracted the word "more" as the URL.
    const propRe = /<[a-z0-9]+\b([^>]*\bitemprop=["']([a-zA-Z]+)["'][^>]*)>([^<]{0,300})/gi;
    let pm: RegExpExecArray | null;
    while ((pm = propRe.exec(window)) !== null) {
      const field = MICRO_FIELD[pm[2].toLowerCase()];
      if (!field) continue;
      const attrs = pm[1];
      // Attribute value wins over text content: the visible text of a link is a
      // label, while href/content/src carry the machine-readable value.
      const value = (attr(attrs, 'content') ?? attr(attrs, 'href') ?? attr(attrs, 'src')
                     ?? attr(attrs, 'datetime') ?? pm[3] ?? '').trim();
      if (value && vals[field] === undefined) vals[field] = value;
    }
    const rec = toRecord(vals, { kind, baseUrl, via: 'microdata' });
    if (rec) out.push(rec);
  }
  return out;
}

// ── Meta tags ────────────────────────────────────────────────────────────────
// The floor. A detail page for ONE attraction usually has nothing but Open
// Graph — which is still a real name, a real photo and a real link, so it beats
// returning nothing for the page we were sent to read.

export function readMetaTags(html: string, baseUrl?: string): ExtractedRecord[] {
  const meta = harvestMeta(html);
  const title = meta['og:title'] ?? meta['twitter:title'];
  if (!title) return [];
  const rec = toRecord({
    name: title,
    description: meta['og:description'] ?? meta['description'] ?? meta['twitter:description'],
    image: meta['og:image'] ?? meta['og:image:secure_url'] ?? meta['twitter:image'],
    url: meta['og:url'] ?? baseUrl,
    lat: meta['place:location:latitude'] ?? meta['geo.position']?.split(';')[0],
    lng: meta['place:location:longitude'] ?? meta['geo.position']?.split(';')[1],
    locality: meta['og:locality'] ?? meta['geo.placename'],
    country: meta['og:country-name'],
    startDate: meta['event:start_time'],
    endDate: meta['event:end_time'],
  }, {
    kind: meta['og:type']?.includes('event') ? 'event' : 'attraction',
    baseUrl,
    via: 'meta',
  });
  return rec ? [rec] : [];
}

/** Everything the built-in skills can read, tagged with which one read it. */
export function readBuiltIns(
  html: string, payloads: Payload[], baseUrl?: string,
): { records: ExtractedRecord[]; bySkill: Record<string, number> } {
  const bySkill: Record<string, number> = {};
  const records: ExtractedRecord[] = [];

  const add = (skill: string, recs: ExtractedRecord[]) => {
    const usable = recs.filter(isUsableRecord);
    bySkill[skill] = (bySkill[skill] ?? 0) + usable.length;
    records.push(...usable);
  };

  add('ld+json', readSchemaOrg(payloads, baseUrl));
  add('microdata', readMicrodata(html, baseUrl));
  // Only fall back to meta tags when the structured readers found nothing —
  // on a listing page og:title is the page's own title, not a listing.
  if (records.length === 0) add('meta', readMetaTags(html, baseUrl));

  return { records, bySkill };
}
