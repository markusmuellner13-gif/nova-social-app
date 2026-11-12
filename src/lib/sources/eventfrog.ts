// Eventfrog — free, keyless event listings for Austria, Switzerland, Germany
// and Liechtenstein, searchable by COORDINATES.
//
// Why this source exists: measured on 2026-11-12, a user in Baden bei Wien got
// zero events. Eventbrite's Baden page is Vienna spill-over, allevents.in has no
// Baden page, and the town's own calendar is an ASP.NET postback form nothing can
// read. Eventfrog's geo search around Baden returned real local events (Baden,
// Bad Vöslau, Guntramsdorf) — and a name search for "Baden" returned Baden in
// SWITZERLAND, which is exactly why this module only ever searches by lat/lng.
//
// Two hops, both allowed by eventfrog's robots.txt:
//   1. /de/events.html?geoRadius=&lat=&lng=   → ~47 tiles (single events + series)
//   2. each single event's own page            → schema.org Event JSON-LD with the
//      venue's exact coordinates, start time, address, description and image.
// Hop 2 is what makes a post trustworthy: the pin is the venue's, not a guess.
// Both hops are cached in Redis, so a town costs one list fetch per few hours
// and each event page is read once per half day however many users open it.

import type { ApiPost } from './shared';
import { extractEventsFromHtml, toApiPost, type CrawledEvent } from './webCrawler';
import { cacheGet, cacheSet } from '@/lib/serverCache';
import { upstreamPaused, pauseUpstream, retryAfterSeconds } from '@/lib/sourceBreaker';
import { validateBatch } from '@/lib/eventValidation';

const ORIGIN = 'https://eventfrog.at';
const BREAKER = 'eventfrog';
const LIST_TTL_S = 3 * 60 * 60;
const DETAIL_TTL_S = 12 * 60 * 60;
const LIST_TIMEOUT_MS = 7_000;
const DETAIL_TIMEOUT_MS = 4_000;
const DETAIL_CONCURRENCY = 8;
const DEFAULT_BUDGET_MS = 7_000;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'de-AT,de;q=0.9,en;q=0.8',
};

/**
 * Eventfrog lists events in the DACH countries (+ Liechtenstein). Outside that
 * box its geo search returns nothing (measured: Milan → 0 tiles), so we don't
 * spend a request there. A bounding box rather than a country-name match, because
 * the client may send "Österreich", "Austria" or "Autriche".
 */
export function inEventfrogArea(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= 45.8 && lat <= 55.1 && lng >= 5.8 && lng <= 17.2;
}

// Eventfrog's own category (the first path segment after /p/) → Nova's.
export const EVENTFROG_CATEGORY: Record<string, string> = {
  'konzerte': 'music',
  'partys': 'events',
  'sport-fitness': 'sports',
  'kunst-ausstellungen': 'art',
  'lesung-literatur': 'art',
  'theater-buehne': 'art',
  'film': 'art',
  'comedy': 'events',
  'essen-trinken': 'food',
  'maerkte': 'community',
  'kurse-seminare': 'community',
  'fuehrungen-vortraege': 'community',
  'gesundheit-spiritualitaet': 'fitness',
  'kinder-familie': 'community',
  'messen-ausstellungen': 'events',
};

export interface EventfrogTile {
  url: string;          // absolute event page URL
  id: string;           // eventfrog's numeric id, stable across crawls
  title: string;
  image?: string;
  category: string;     // eventfrog's slug, e.g. "konzerte"
}

function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

/**
 * The single-event tiles of a list page. Series ("Eventgruppe", /p/gruppen/)
 * are skipped: they have no one date, and a card that can't say when it is
 * would be a worse post than none.
 */
export function parseEventfrogList(html: string): EventfrogTile[] {
  const out: EventfrogTile[] = [];
  const seen = new Set<string>();
  const re = /<a\s+href="(\/[a-z]{2}\/p\/([a-z0-9-]+)\/[^"]*?-(\d{6,})\.html)"[^>]*class="event-list__events__tile"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [, path, slug, id, body] = m;
    if (slug === 'gruppen' || seen.has(id)) continue;
    const title = decode(body.match(/infos__title">([^<]*)</)?.[1] ?? '');
    if (!title) continue;
    seen.add(id);
    const image = body.match(/<img[^>]+src="(https:\/\/[^"]+)"/)?.[1];
    out.push({ url: `${ORIGIN}${path}`, id, title, image, category: slug });
  }
  return out;
}

/** Tiles worth fetching for a Nova category. The broad buckets take everything. */
export function tilesForCategory(tiles: EventfrogTile[], category: string): EventfrogTile[] {
  if (category === 'events' || category === 'discover') return tiles;
  return tiles.filter(t => (EVENTFROG_CATEGORY[t.category] ?? 'events') === category);
}

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (res.status === 429 || res.status >= 500) {
    await pauseUpstream(BREAKER, retryAfterSeconds(res) ?? (res.status === 429 ? 600 : 120), `HTTP ${res.status}`);
    return null;
  }
  return res.ok ? res.text() : null;
}

async function listTiles(lat: number, lng: number, radiusKm: number): Promise<EventfrogTile[]> {
  const r = Math.max(1, Math.min(50, Math.round(radiusKm)));
  const key = `nova:ef:list:v1:${lat.toFixed(2)}:${lng.toFixed(2)}:r${r}`;
  const cached = await cacheGet<EventfrogTile[]>(key);
  if (cached) return cached;
  const html = await fetchText(`${ORIGIN}/de/events.html?geoRadius=${r}&lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`, LIST_TIMEOUT_MS);
  if (html === null) return [];
  const tiles = parseEventfrogList(html);
  await cacheSet(key, tiles, tiles.length ? LIST_TTL_S : 30 * 60);
  return tiles;
}

/** The event page's own schema.org Event, or null when it has none. */
async function eventDetail(tile: EventfrogTile): Promise<CrawledEvent | null> {
  const key = `nova:ef:ev:v1:${tile.id}`;
  const cached = await cacheGet<CrawledEvent | 'none'>(key);
  if (cached) return cached === 'none' ? null : cached;
  const html = await fetchText(tile.url, DETAIL_TIMEOUT_MS).catch(() => null);
  if (html === null) return null; // transient — don't remember a miss
  const ev = extractEventsFromHtml(html)[0] ?? null;
  await cacheSet(key, ev ?? 'none', DETAIL_TTL_S);
  return ev;
}

export async function fetchEventfrogEvents(opts: {
  city: string; country: string; lat: number; lng: number; radiusKm: number;
  category: string; count: number; page: number; budgetMs?: number;
}): Promise<{ posts: ApiPost[]; hasMore: boolean }> {
  const { city, country, lat, lng, radiusKm, category, count, page } = opts;
  if (!inEventfrogArea(lat, lng) || await upstreamPaused(BREAKER)) return { posts: [], hasMore: false };

  const wanted = tilesForCategory(await listTiles(lat, lng, radiusKm), category);
  const slice = wanted.slice(page * count, page * count + count);
  if (slice.length === 0) return { posts: [], hasMore: false };

  // Read the event pages in small parallel batches, inside a time budget: a slow
  // page costs at most its own timeout, and whatever isn't read in time is
  // simply left for the next request (the list is cached, so it's cheap).
  const deadline = Date.now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS);
  const details: (CrawledEvent | null)[] = new Array(slice.length).fill(null);
  for (let i = 0; i < slice.length && Date.now() < deadline - 500; i += DETAIL_CONCURRENCY) {
    const batch = slice.slice(i, i + DETAIL_CONCURRENCY);
    const got = await Promise.all(batch.map(t => eventDetail(t).catch(() => null)));
    got.forEach((ev, j) => { details[i + j] = ev; });
  }

  const posts: ApiPost[] = [];
  slice.forEach((tile, i) => {
    const ev = details[i];
    // No exact coordinates → no post. The geo search found it NEAR here, but
    // "near" is what the pin has to prove, and a guessed pin is how foreign
    // listings used to pass as local.
    if (!ev || typeof ev.lat !== 'number' || typeof ev.lng !== 'number') return;
    if (!ev.image && tile.image) ev.image = tile.image;
    // A specific tab keeps its own category (it only asked for matching tiles);
    // the mixed Discover stream files each event under what it actually is.
    const novaCat = category === 'discover' ? (EVENTFROG_CATEGORY[tile.category] ?? 'events') : category;
    const post = toApiPost(ev, i, city, country, lat, lng, novaCat);
    if (!post) return;
    // Eventfrog's own id is stable across crawls, so the same event is one row
    // in our database however often it's seen.
    posts.push({ ...post, id: `ef_${tile.id}`, eventUrl: post.eventUrl || tile.url });
  });

  // The same gate every crawled source passes: real date, real title, and a pin
  // inside the radius that was asked for (plus a little slack for the venue).
  const valid = validateBatch(posts, { cityLat: lat, cityLng: lng, maxKm: radiusKm + 3 }).valid;
  return { posts: valid, hasMore: wanted.length > (page + 1) * count };
}
