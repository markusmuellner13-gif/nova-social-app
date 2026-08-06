// ─────────────────────────────────────────────────────────────────────────────
// Put a post where it actually IS.
//
// WHAT THIS FIXES — measured on the live Vienna feed 2026-08-06: 8 posts, only
// TWO distinct coordinate pairs, and `distanceKm: 0` on every one — despite
// venue names that are kilometres apart in reality (Shebeen International Pub,
// Sigmund Freud Park, Zoku Vienna, CellaVie Aviation Club).
//
// The cause is webCrawler.ts:466-468: a crawled listing's JSON-LD carries
// `geo.latitude` only occasionally, and when it doesn't, the post falls back to
// the CITY CENTRE. Almost nothing on allevents.in publishes geo, so almost
// every event in the app is stamped with its city's centre point.
//
// What that broke, all quietly:
//   • "· 1.3 km" distance labels — meaningless, and mostly absent
//   • the map/globe — every pin in a city stacks on one dot
//   • the ranker — `proximity` is one of the Brain's 15 features and it was
//     being fed a constant, so it contributed nothing while looking trained
//   • "only stuff happening in that area" — true at city level, not street level
//
// So: geocode the venue. Nominatim is free and keyless but asks for ≤1 req/s
// and a real User-Agent, so every lookup is cached permanently (venues do not
// move), paced, and time-boxed. This runs at INGEST, where the result is stored
// and paid for once — never on a user's request.
//
// A WRONG coordinate is worse than a coarse one: it would place an event in the
// wrong part of the world and quietly corrupt distance, map and ranking. So a
// result is only accepted when it lands within `MAX_KM` of the city centre;
// otherwise the post keeps the city centre it already had.
// ─────────────────────────────────────────────────────────────────────────────

import { cacheGet, cacheSet } from '@/lib/serverCache';
import { haversineKm, type ApiPost } from './shared';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
// Nominatim's usage policy requires an identifying UA; a generic one gets 403s.
const UA = 'Nova-App/2.0 (contact@nova-app.com)';

/** Venues don't move. Cache for 180 days. */
const TTL_SECONDS = 180 * 24 * 3600;
/** A geocode further than this from the city centre is a mismatch, not a venue. */
const MAX_KM = 60;
/** Nominatim asks for at most 1 request per second. */
const MIN_GAP_MS = 1100;
/** Coordinates this close to the city centre are the fallback, not a real venue. */
const CENTRE_EPSILON_KM = 0.05;

let lastCallAt = 0;

async function pace(): Promise<void> {
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

function cacheKey(query: string): string {
  return `nova:geo:v1:${query.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 180)}`;
}

export interface Coords { lat: number; lng: number }

/**
 * The pieces of a post's address that are worth searching on.
 *
 * `eventVenue` arrives as "Shebeen International Pub, 45 Lerchenfelder Straße,
 * Wien" — name, then street, then city.
 */
export function venueParts(post: ApiPost, city: string): { name: string; street: string; city: string } {
  const raw = (post.eventVenue || post.location?.name || '').trim();
  const segs = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const isCity = (s: string) => s.toLowerCase() === city.toLowerCase();
  const name = segs[0] && !isCity(segs[0]) ? segs[0] : '';
  // The street is the segment carrying a house number, or the second segment.
  const street = segs.slice(1).find((s) => !isCity(s) && /\d/.test(s))
    ?? segs.slice(1).find((s) => !isCity(s))
    ?? '';
  return { name, street, city };
}

/** Strip a leading house number: "45 Lerchenfelder Straße" → the street alone. */
function streetWithoutNumber(street: string): string {
  return street.replace(/^\s*\d+[a-z]?\s+/i, '').replace(/\s+\d+[a-z]?\s*$/i, '').trim();
}

/**
 * Forward-geocode one venue, trying narrow queries in order of precision.
 *
 * MEASURED, and the reason this is a cascade rather than one lookup: a single
 * combined free-form query — "Shebeen International Pub, 45 Lerchenfelder
 * Straße, Vienna" — returns ZERO results from Nominatim for every venue tried.
 * Over-specified free-form search matches nothing. The same venues resolve fine
 * when asked more narrowly:
 *
 *   structured street=45 Lerchenfelder Strasse & city=Vienna
 *                                  → "Shebeen, 45, Lerchenfelder Straße"  1.85 km
 *   q="Zoku Vienna"                → "Zoku Vienna, Perspektivstraße"      2.34 km
 *   q="Sigmund Freud Park, Vienna" → "Sigmund-Freud-Park, Alservorstadt"  1.23 km
 *   q="Taborstraße, Vienna"        → the street itself                    1.35 km
 *
 * So: exact address first, then the venue by name, then the street without its
 * house number. First accepted hit wins; a whole-cascade miss is cached so the
 * next sweep doesn't repeat it.
 */
export async function geocodeVenue(
  parts: { name: string; street: string; city: string },
  { cityLat, cityLng, timeoutMs = 4000 }: { cityLat: number; cityLng: number; timeoutMs?: number },
): Promise<Coords | null> {
  const { name, street, city } = parts;
  if (!city || (!name && !street)) return null;

  const key = cacheKey(`${name}|${street}|${city}`);
  const cached = await cacheGet<Coords | 'miss'>(key);
  if (cached === 'miss') return null;
  if (cached && typeof cached === 'object' && Number.isFinite(cached.lat)) return cached;

  const bare = streetWithoutNumber(street);
  const attempts: string[] = [];
  if (street) attempts.push(`${NOMINATIM}?street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}&format=json&limit=1`);
  if (name)   attempts.push(`${NOMINATIM}?q=${encodeURIComponent(`${name}, ${city}`)}&format=json&limit=1`);
  if (bare && bare !== street) attempts.push(`${NOMINATIM}?q=${encodeURIComponent(`${bare}, ${city}`)}&format=json&limit=1`);

  let transientOnly = attempts.length > 0;
  for (const url of attempts) {
    try {
      await pace();
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) continue; // 429/5xx — transient, keep `transientOnly` true
      const rows = (await res.json()) as { lat?: string; lon?: string }[];
      const first = Array.isArray(rows) ? rows[0] : undefined;
      const lat = Number(first?.lat);
      const lng = Number(first?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) { transientOnly = false; continue; }
      // A "venue" on another continent is a name collision, not our venue.
      // Placing an event in the wrong city is far worse than leaving it coarse.
      if (haversineKm(cityLat, cityLng, lat, lng) > MAX_KM) { transientOnly = false; continue; }
      const out = { lat, lng };
      await cacheSet(key, out, TTL_SECONDS);
      return out;
    } catch {
      /* timeout/network — try the next form */
    }
  }
  // Only remember a miss when the geocoder actually answered "not found".
  // Caching a rate-limited or timed-out lookup for 180 days would permanently
  // strand a venue that is perfectly findable.
  if (!transientOnly) await cacheSet(key, 'miss', TTL_SECONDS);
  return null;
}

/** True when a post is sitting on the city centre, i.e. it was never located. */
export function isAtCityCentre(post: ApiPost, cityLat: number, cityLng: number): boolean {
  const lat = post.location?.lat;
  const lng = post.location?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  return haversineKm(cityLat, cityLng, lat as number, lng as number) <= CENTRE_EPSILON_KM;
}

/**
 * Give city-centred posts their venue's real coordinates.
 *
 * Time-boxed, because it runs inside the ingest route's per-item window and a
 * slow geocoder must never be the reason a whole slice times out. Posts that
 * don't get resolved in the budget keep the city centre and will be picked up
 * on a later sweep — by then the cache is warm, so it costs nothing.
 */
export async function backfillVenueCoords<T extends ApiPost>(
  posts: T[],
  { city, cityLat, cityLng, budgetMs = 8000 }:
    { city: string; cityLat: number; cityLng: number; budgetMs?: number },
): Promise<{ posts: T[]; located: number; attempted: number }> {
  if (!Array.isArray(posts) || posts.length === 0) {
    return { posts: posts ?? [], located: 0, attempted: 0 };
  }
  const deadline = Date.now() + budgetMs;
  let located = 0;
  let attempted = 0;

  for (const post of posts) {
    if (Date.now() > deadline) break;
    if (!isAtCityCentre(post, cityLat, cityLng)) continue; // already real
    const parts = venueParts(post, city);
    if (!parts.name && !parts.street) continue; // nothing to look up
    attempted++;
    const hit = await geocodeVenue(parts, { cityLat, cityLng });
    if (hit && post.location) {
      post.location.lat = hit.lat;
      post.location.lng = hit.lng;
      located++;
    }
  }
  return { posts, located, attempted };
}
