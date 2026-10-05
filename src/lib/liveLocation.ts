// Decides what a new live GPS fix should change. Kept pure (no React, no
// browser APIs) so the thresholds are unit-tested rather than eyeballed.
//
// Two separate costs are being balanced:
//   • committing a position re-renders everything that reads the location and
//     re-stamps every post's distance — cheap, but pointless for GPS jitter;
//   • reverse-geocoding calls a free public service (Nominatim) whose usage
//     policy is at most ~1 request/second and no bulk use — so it happens only
//     after a real move, and never more than once a minute per device.

export interface LivePoint {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface LiveDecision {
  /** Update the app's position (distances, ranking, the live label). */
  commit: boolean;
  /** Also resolve the place name again (area / city may have changed). */
  regeocode: boolean;
}

/** Ignore movement smaller than this — it's GPS noise, not the user walking. */
export const COMMIT_MIN_M = 120;
/** Re-resolve the area name after moving this far from the last lookup. */
export const REGEOCODE_MIN_M = 500;
/** …but never more often than this, however fast the user is travelling. */
export const REGEOCODE_MIN_INTERVAL_MS = 60_000;
/** A fix this vague says nothing about which street the user is on. */
export const MAX_USEFUL_ACCURACY_M = 2_000;

const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function metresBetween(a: LivePoint, b: LivePoint): number {
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function decideLiveUpdate(
  fix: LivePoint,
  committed: LivePoint | null,
  lastGeocode: { at: number; point: LivePoint } | null,
  now: number,
): LiveDecision {
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return { commit: false, regeocode: false };
  if (typeof fix.accuracy === 'number' && fix.accuracy > MAX_USEFUL_ACCURACY_M) {
    return { commit: false, regeocode: false };
  }

  // A clearly sharper fix of the same spot is worth committing even without a
  // move — the first fix after launch is often a coarse network guess.
  const sharper = committed?.accuracy !== undefined && fix.accuracy !== undefined
    && fix.accuracy < committed.accuracy * 0.5 && committed.accuracy - fix.accuracy > 50;
  const moved = committed ? metresBetween(committed, fix) : Infinity;
  const commit = moved >= COMMIT_MIN_M || sharper;
  if (!commit) return { commit: false, regeocode: false };

  const sinceGeocode = lastGeocode ? metresBetween(lastGeocode.point, fix) : Infinity;
  const regeocode = sinceGeocode >= REGEOCODE_MIN_M
    && (!lastGeocode || now - lastGeocode.at >= REGEOCODE_MIN_INTERVAL_MS);
  return { commit, regeocode };
}

/** Rounded coordinate for effect dependencies: ~1.1 km at 2 decimals. */
export function coarse(n: number | undefined, decimals = 2): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Re-measure every post's distance from where the user is NOW. The server
 * stamps `distanceKm` relative to the position the page was fetched for, so
 * once the user walks on, those numbers (and everything ranked on them — the
 * local/nearby split, the brain's proximity feature) go stale. Posts whose
 * distance barely changed keep their identity, so memoised cards don't
 * re-render for nothing.
 */
export function restampDistances<T extends { location?: { lat: number; lng: number } | null; distanceKm?: number }>(
  posts: T[], lat: number | undefined, lng: number | undefined,
): T[] {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return posts;
  if (lat === 0 && lng === 0) return posts;
  let changed = false;
  const out = posts.map(p => {
    const loc = p.location;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng) || (loc.lat === 0 && loc.lng === 0)) return p;
    const km = Math.round(metresBetween({ lat, lng }, loc) / 10) / 100;
    if (typeof p.distanceKm === 'number' && Math.abs(p.distanceKm - km) < 0.05) return p;
    changed = true;
    return { ...p, distanceKm: km };
  });
  return changed ? out : posts;
}

/** How far the user must move inside one city before the feed is re-fetched. */
export const FEED_REFRESH_MOVE_M = 1_500;
