// Finding a real photo OF a specific place — the cascade behind "every post has
// a picture".
//
// Measured on 360 real OSM venues across Vienna / Rome / Barcelona, only 46%
// carry any photo lead in their own tags at all (website 38%, brand:wikidata 8%,
// wikidata 3%, a direct image tag 0.3%) — and outside Vienna it drops to ~30%.
// So OSM tags alone can never put a picture on every card. Google Places is the
// only source that knows a photo of essentially any named business on earth,
// which is why it sits in the middle of this cascade rather than at the end.
//
// Every step returns a photo OF THE SUBJECT — its own tags, its own Wikidata
// entity, its brand's entity, Google's photo of that exact venue, or the hero
// image from the venue's own website. Nothing here is keyword-matched, so a
// result is always attributable to the place it is shown on.

import type { ApiPost } from './shared';
import { enforceRealImages } from './realImage';
import { fetchCommonsImagesByWikidata } from './wikipedia';
import { placesBudgetExceeded, notePlacesCall } from '@/lib/placesBudget';

// ─────────────────────────────────────────────────────────────────────────────
// Quality guards
// ─────────────────────────────────────────────────────────────────────────────

// A site's og:image is very often its logo, a share badge, or a spacer. Those
// are technically "the company's own image" but they make a terrible card — the
// point of the cascade is a photograph, so keep looking when we get artwork.
const LOGO_LIKE = /(^|[/_-])(logo|favicon|icon|sprite|badge|avatar|placeholder|default|blank|spacer|share|og-?default|social)([/_.-]|$)/i;

// Sites that DESCRIBE a place without BEING it. Their og:image is the
// directory's own branding, so treating one as "the venue's page" puts the
// OpenStreetMap logo on every venue that has no website of its own — which is
// the same "a picture that belongs to something else" bug in a new costume.
// A venue's own site is fair game (its logo is at least its own); a map
// database's is not.
const DIRECTORY_HOSTS = /(^|\.)(openstreetmap\.org|osm\.org|openstreetmap\.de)$/i;

export function isDirectoryUrl(url: string): boolean {
  try { return DIRECTORY_HOSTS.test(new URL(url).hostname); } catch { return false; }
}

export function looksLikeLogo(url: string): boolean {
  try {
    const u = new URL(url);
    if (/\.svg(\?|$)/i.test(u.pathname)) return true;      // vector = never a photo
    if (/apple-touch-icon|android-chrome|mstile/i.test(u.pathname)) return true;
    return LOGO_LIKE.test(u.pathname);
  } catch { return true; }
}

/**
 * Reject images too small to fill a feed card. `og:image:width` is advisory but
 * widely published; when it is absent we let the image through rather than pay
 * for a HEAD request per candidate.
 */
export function tooSmall(width?: number, height?: number): boolean {
  if (width && width < 500) return true;
  if (height && height < 400) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// The venue's own website
// ─────────────────────────────────────────────────────────────────────────────

// OSM records a business's site under a surprising number of keys, and the feed
// used to read only `website`. Reading the rest is free coverage.
const WEBSITE_KEYS = [
  'website', 'contact:website', 'contact:url', 'url',
  'operator:website', 'brand:website', 'website:official',
];

export function websiteFromTags(tags: Record<string, string>): string {
  for (const k of WEBSITE_KEYS) {
    const v = (tags[k] ?? '').trim();
    if (!v) continue;
    const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try { new URL(url); return url; } catch { /* malformed — try the next key */ }
  }
  return '';
}

interface Candidate { url: string; width?: number; height?: number; rank: number }

/**
 * Every image a page advertises as representing itself, best first:
 * og:image → twitter:image → JSON-LD `image` → link rel=image_src.
 *
 * The previous lookup read only `og:image` and took it even when it was the
 * site's logo, so a venue with a real hero photo further down the list got a
 * grey wordmark on its card.
 */
export function extractPageImages(html: string, pageUrl: string): Candidate[] {
  const out: Candidate[] = [];
  const push = (raw: string | undefined, rank: number, width?: number, height?: number) => {
    if (!raw) return;
    let src = raw.trim().replace(/&amp;/g, '&');
    if (!src) return;
    try { src = new URL(src, pageUrl).toString(); } catch { return; }
    if (!/^https?:\/\//i.test(src)) return;
    out.push({ url: src, rank, width, height });
  };

  const meta = (re: RegExp) => { const m = html.match(re); return m?.[1]; };
  const num = (v: string | undefined) => { const n = parseInt(v ?? '', 10); return Number.isFinite(n) ? n : undefined; };

  const ogW = num(meta(/<meta[^>]+property=["']og:image:width["'][^>]+content=["']([^"']+)["']/i));
  const ogH = num(meta(/<meta[^>]+property=["']og:image:height["'][^>]+content=["']([^"']+)["']/i));

  push(meta(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i), 0, ogW, ogH);
  push(meta(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i), 0, ogW, ogH);
  push(meta(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i), 1);
  push(meta(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i), 1);

  // JSON-LD often carries the real photography even when og:image is the logo.
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (v: unknown, depth = 0) => {
        if (depth > 6 || !v) return;
        if (typeof v === 'string') return;
        if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
        const o = v as Record<string, unknown>;
        const img = o.image ?? o.photo ?? o.primaryImageOfPage;
        if (typeof img === 'string') push(img, 2);
        else if (Array.isArray(img)) { for (const x of img) if (typeof x === 'string') push(x, 2); }
        else if (img && typeof img === 'object') push((img as Record<string, unknown>).url as string, 2);
        for (const val of Object.values(o)) if (val && typeof val === 'object') walk(val, depth + 1);
      };
      walk(JSON.parse(m[1]));
    } catch { /* not valid JSON-LD — skip */ }
  }

  push(meta(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i), 3);

  // Prefer real photography over logos, then the site's own preferred order.
  const seen = new Set<string>();
  return out
    .filter(c => (seen.has(c.url) ? false : (seen.add(c.url), true)))
    .filter(c => !tooSmall(c.width, c.height))
    .sort((a, b) => (Number(looksLikeLogo(a.url)) - Number(looksLikeLogo(b.url))) || (a.rank - b.rank));
}

const sitePhotoCache = new Map<string, string | null>();

/** The best self-representing photo on a venue's own website. */
export async function fetchSitePhoto(website: string, timeoutMs = 3500): Promise<string | null> {
  if (!website) return null;
  if (sitePhotoCache.has(website)) return sitePhotoCache.get(website) ?? null;
  let result: string | null = null;
  try {
    const res = await fetch(website, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NovaBot/1.0; +https://nova-app.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (res.ok && (res.headers.get('content-type') ?? '').includes('html')) {
      const html = (await res.text()).slice(0, 200_000); // JSON-LD sits below <head>
      const candidates = extractPageImages(html, res.url || website);
      // A logo is better than a blank card, but only once nothing else is left.
      result = candidates.find(c => !looksLikeLogo(c.url))?.url ?? candidates[0]?.url ?? null;
    }
  } catch { /* unreachable site — fall through */ }
  sitePhotoCache.set(website, result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Places — the only source that covers essentially any named business
// ─────────────────────────────────────────────────────────────────────────────

const placePhotoCache = new Map<string, string | null>();

export async function fetchGooglePlacePhoto(name: string, lat: number, lng: number): Promise<string | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  const cacheKey = `${name}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
  if (placePhotoCache.has(cacheKey)) return placePhotoCache.get(cacheKey) ?? null;
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
      const d = await findRes.json() as {
        candidates?: { photos?: { photo_reference?: string }[] }[];
        status?: string; error_message?: string;
      };
      const ref = d.candidates?.[0]?.photos?.[0]?.photo_reference;
      if (ref) {
        // maxwidth=1600 so the card has real pixels to work with on a 3× phone.
        const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1600&photo_reference=${ref}&key=${key}`;
        const photoRes = await fetch(photoUrl, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
        result = photoRes.headers.get('location');
      }
    }
  } catch { /* fall through to the website */ }
  placePhotoCache.set(cacheKey, result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// The cascade
// ─────────────────────────────────────────────────────────────────────────────

export interface PhotoSubject {
  name: string;
  lat: number;
  lng: number;
  tags?: Record<string, string>;
  /** Explicit site when the caller has one the tags don't (event organiser). */
  website?: string;
}

export interface FoundPhoto {
  image: string;
  /** Which step produced it — surfaced by the coverage probe and cron logs. */
  via: string;
  /** Extra real frames of the same subject, for the swipeable gallery. */
  gallery?: string[];
}

/** A photo straight from OSM's own tags — free, real, no extra request. */
export function osmTagImage(tags: Record<string, string>): string | null {
  const direct = tags.image ?? tags['image:0'] ?? '';
  if (/^https?:\/\/\S+\.(jpe?g|png|webp|gif)/i.test(direct) && !looksLikeLogo(direct)) return direct;
  const commons = tags.wikimedia_commons ?? tags['image:wikimedia'] ?? '';
  if (commons.startsWith('File:')) {
    const file = commons.slice('File:'.length);
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1600`;
  }
  return null;
}

/**
 * Find a real photo of `subject`, trying every source that can be attributed to
 * it. Returns null only when the place is genuinely undocumented everywhere.
 */
export async function findVenuePhoto(subject: PhotoSubject): Promise<FoundPhoto | null> {
  const tags = subject.tags ?? {};

  // 1. The place's own OSM image tag.
  const tagged = osmTagImage(tags);
  if (tagged) return { image: tagged, via: 'osm-tag' };

  // 2. Its own Wikidata entity — landmarks, museums, parks, stadiums. Gives a
  //    multi-photo gallery when the entity has one.
  if (tags.wikidata) {
    const gallery = await fetchCommonsImagesByWikidata(tags.wikidata).catch(() => []);
    if (gallery.length) {
      return { image: gallery[0], via: 'wikidata', gallery: gallery.length >= 2 ? gallery : undefined };
    }
  }

  // 3. Google Places. Deliberately ahead of the website: it answers for ~every
  //    named business, returns an actual photograph rather than whatever the
  //    site put in og:image, and is a single fast call.
  const places = await fetchGooglePlacePhoto(subject.name, subject.lat, subject.lng);
  if (places) return { image: places, via: 'google-places' };

  // 4. The venue's own website.
  const site = subject.website || websiteFromTags(tags);
  if (site) {
    const photo = await fetchSitePhoto(site);
    if (photo) return { image: photo, via: 'website' };
  }

  // 5. The brand's entity — a chain outlet with nothing of its own still gets
  //    the company's real photography rather than a blank card.
  if (tags['brand:wikidata']) {
    const gallery = await fetchCommonsImagesByWikidata(tags['brand:wikidata']).catch(() => []);
    if (gallery.length) return { image: gallery[0], via: 'brand-wikidata' };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Backfill — the last mile to "a picture on every post"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Give every photoless post a real picture, from:
 *   1. its own event page (the poster the organiser published), then
 *   2. the venue or organiser putting it on — their Places photo or their own
 *      website. An event at the Wiener Stadthalle showing the Stadthalle's real
 *      photo is accurate: it is where the thing happens, and the card says so.
 *
 * Time-boxed and pooled, because this runs inside the feed request. Whatever
 * does not resolve before the deadline keeps the designed cover — the budget is
 * spent on the cards nearest the top of the feed first.
 */
export async function backfillPostPhotos<T extends ApiPost>(
  posts: T[], opts: { budgetMs?: number; concurrency?: number } = {}
): Promise<T[]> {
  const deadline = Date.now() + (opts.budgetMs ?? 3500);
  const concurrency = opts.concurrency ?? 8;

  // Feed order is relevance order, so the earliest photoless posts matter most.
  const pending = posts.filter(p => !p.image);
  if (pending.length === 0) return posts;

  const resolved = new Map<string, { image: string; gallery?: string[] }>();
  let cursor = 0;

  const worker = async () => {
    while (cursor < pending.length && Date.now() < deadline) {
      const post = pending[cursor++];
      try {
        // 1. The event's own page. Skipped for directory links — an OSM place
        //    with no website carries its openstreetmap.org URL here, and that
        //    page's og:image is the OpenStreetMap logo.
        if (post.eventUrl && /^https?:\/\//.test(post.eventUrl) && !isDirectoryUrl(post.eventUrl)) {
          const photo = await fetchSitePhoto(post.eventUrl, 2500);
          if (photo) { resolved.set(post.id, { image: photo }); continue; }
        }
        if (Date.now() >= deadline) return;

        // 2. Whoever is putting it on.
        const subject = (post.eventVenue || post.organizer || '').split(',')[0].trim();
        const lat = post.location?.lat ?? 0;
        const lng = post.location?.lng ?? 0;
        if (subject && (lat || lng)) {
          const found = await findVenuePhoto({ name: subject, lat, lng });
          if (found) resolved.set(post.id, { image: found.image, gallery: found.gallery });
        }
      } catch { /* this post keeps its cover */ }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
  if (resolved.size === 0) return posts;

  return posts.map(p => {
    const found = resolved.get(p.id);
    return found ? { ...p, image: found.image, images: p.images ?? found.gallery } : p;
  });
}

/**
 * The one call every feed response goes through: fill in the missing pictures,
 * then enforce that each one is a real photo of its own post and that no two
 * unrelated posts share a photograph.
 */
export async function finalizePhotos<T extends ApiPost>(
  posts: T[], budgetMs?: number
): Promise<T[]> {
  return enforceRealImages(await backfillPostPhotos(posts, { budgetMs }));
}
