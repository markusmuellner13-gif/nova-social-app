// Write-through persistence — the fix for "Restaurants is empty in half the world".
//
// Place categories (restaurants, hotels, venues, shops, outdoors, rentals, pets,
// fashion, lifestyle) are served by OpenStreetMap's Overpass API. Overpass is
// free and worldwide, which is why we use it — but it is also slow (20s on a
// cold area) and frequently unavailable. Measured on production: Lisbon,
// Amsterdam, Cupertino, San Francisco and New York all returned nothing, while
// Vienna, Barcelona and Rome took 20-22 seconds. Nine of the app's categories
// were riding on a service that answers maybe half the time.
//
// Previously only the nightly ingest cron wrote to Postgres, so a city nobody
// had ingested stayed broken until the cron reached it. Now EVERY successful
// live computation is written back: the first visitor to a city pays the slow
// fetch once, and everyone after them — plus that same person tomorrow, plus the
// chatbot, plus the trip planner — is served from the database in about a
// second, whether or not Overpass is up.
//
// Fully gated: without SUPABASE_SERVICE_ROLE_KEY this is a no-op and the app
// behaves exactly as before.

import type { ApiPost } from '@/lib/sources/shared';
import { dbWriteEnabled, upsertEvents, postToRow } from '@/lib/eventsDb';
import { validateBatch } from '@/lib/eventValidation';
import { curate } from './curator';
import { sourceOf } from './features';

/** Places change slowly; a restaurant is still there next week. */
const PLACE_TTL_DAYS = 21;
const EVENT_TTL_DAYS = 3;

export interface PersistResult {
  written: number;
  skipped: number;
}

/**
 * Persist freshly-computed feed results so the next request is instant.
 *
 * Runs the same validation + curation gate as the ingest cron, so nothing enters
 * the database through this path that would not have entered through that one.
 * Never throws: persistence failing must never fail a user's request.
 */
export async function persistFeedResults(
  posts: ApiPost[],
  opts: { city: string; country?: string; lat: number; lng: number; isPlaceCategory: boolean }
): Promise<PersistResult> {
  if (!dbWriteEnabled || posts.length === 0) return { written: 0, skipped: posts.length };
  try {
    const { valid } = validateBatch(posts, {
      cityLat: opts.lat, cityLng: opts.lng,
      // Places must genuinely be in this area; events legitimately reach further.
      maxKm: opts.isPlaceCategory ? 30 : 120,
    });
    if (valid.length === 0) return { written: 0, skipped: posts.length };

    const { kept } = curate(valid);
    if (kept.length === 0) return { written: 0, skipped: posts.length };

    const ttl = opts.isPlaceCategory ? PLACE_TTL_DAYS : EVENT_TTL_DAYS;
    const rows = kept.map(p => postToRow(p, sourceOf(p.id), opts.country ?? null, ttl));
    const written = await upsertEvents(rows);
    return { written, skipped: posts.length - written };
  } catch {
    return { written: 0, skipped: posts.length };
  }
}

/**
 * Fire-and-forget wrapper. The user's response must not wait for a database
 * write, so we start it and move on; on serverless the write completes as part
 * of the same invocation's lifetime in practice, and if it doesn't, the next
 * request simply recomputes.
 */
export function persistInBackground(
  posts: ApiPost[],
  opts: { city: string; country?: string; lat: number; lng: number; isPlaceCategory: boolean }
): void {
  if (!dbWriteEnabled || posts.length === 0) return;
  void persistFeedResults(posts, opts).catch(() => { /* best effort */ });
}
