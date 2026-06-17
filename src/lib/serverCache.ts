import { Redis } from '@upstash/redis';

// ─────────────────────────────────────────────────────────────────────────────
// Server-side ingestion cache (Upstash Redis, REST — works on Vercel edge/node)
//
// WHY: every /api/events request used to hit Ticketmaster / Claude web-search /
// Overpass LIVE, per user, per category, per page. That's slow (web search alone
// is ~10-20s), expensive (AI credits on every scroll), and rate-limited. With
// this layer, the first request for a city+category computes the result and the
// next thousand users read it from Redis in ~10ms. A cron job (see
// /api/cron/warm) pre-computes popular cities so even the first user is instant.
//
// Gracefully NO-OPS when Upstash env vars are absent — the app then behaves
// exactly as before (compute live every time). Nothing breaks without the keys.
// ─────────────────────────────────────────────────────────────────────────────

// Prefer the Vercel Storage (Upstash) integration vars (KV_REST_API_*) since
// that's what the dashboard "Connect Store" flow populates; fall back to
// manually-set UPSTASH_* vars. Only the first non-empty https URL is used.
function firstValid(...candidates: (string | undefined)[]): string {
  for (const c of candidates) { if (c && c.startsWith('https://')) return c; }
  return '';
}
const url   = firstValid(process.env.KV_REST_API_URL,   process.env.UPSTASH_REDIS_REST_URL);
const token = (url === process.env.KV_REST_API_URL)
  ? (process.env.KV_REST_API_TOKEN   ?? '')
  : (process.env.UPSTASH_REDIS_REST_TOKEN ?? '');

// The Upstash REST client requires an https URL and throws synchronously on a
// bad value (e.g. a redis:// connection string). That would crash the build at
// module load, so we validate first and swallow any construction error — the
// app then just runs without a cache instead of failing to deploy.
let redis: Redis | null = null;
try {
  if (url.startsWith('https://') && token) {
    redis = new Redis({ url, token });
  }
} catch {
  redis = null;
}

export const cacheEnabled = redis !== null;

// Round coordinates so nearby users share one cache entry (~1.1km grid).
function gridCoord(n: number): string {
  return n.toFixed(2);
}

export function eventsCacheKey(params: {
  category: string; city: string; lat: number; lng: number;
  page: number; radius: number; source: string;
}): string {
  const { category, city, lat, lng, page, radius, source } = params;
  const c = city.toLowerCase().replace(/\s+/g, '_').slice(0, 40);
  return `nova:events:v1:${source || 'default'}:${category}:${c}:${gridCoord(lat)}:${gridCoord(lng)}:r${radius}:p${page}`;
}

// TTL (seconds) by content type — live events stay fresh, static places last long.
export function cacheTtl(source: string, category: string): number {
  if (source === 'fallback')        return 90;          // low quality — expire fast
  if (category === 'sightseeing')   return 6 * 3600;    // landmarks barely change
  if (['shops', 'venues', 'restaurants', 'hotels', 'rentals'].includes(category)) return 6 * 3600;
  if (source === 'tourism')         return 30 * 60;
  return 5 * 60;                                          // events / music / sports
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    return (await redis.get<T>(key)) ?? null;
  } catch { return null; }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch { /* cache write failures must never break the response */ }
}

// Atomic counter — used for advertiser impression/click analytics (#9).
export async function cacheIncr(key: string, ttlSeconds: number): Promise<number | null> {
  if (!redis) return null;
  try {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, ttlSeconds);
    return n;
  } catch { return null; }
}

export async function cacheGetRaw<T>(key: string): Promise<T | null> {
  return cacheGet<T>(key);
}
