// Small pure geo helpers shared by the UI (kept framework-free so they're unit
// testable in Node without a DOM).

// Angular distance in DEGREES between two lon/lat points on a sphere. Used by the
// globe to hide pins on the back hemisphere (orthographic shows only the front).
export function angularDistance(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const toRad = Math.PI / 180;
  const dLng = (bLng - aLng) * toRad;
  const lat1 = aLat * toRad, lat2 = bLat * toRad;
  const c = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return Math.acos(Math.min(1, Math.max(-1, c))) / toRad;
}

// True when a point is on the visible front hemisphere of a globe whose centre
// faces (centerLng, centerLat). `limit` trims pins right at the horizon edge.
export function isOnFrontHemisphere(
  centerLng: number, centerLat: number, lng: number, lat: number, limit = 89,
): boolean {
  return angularDistance(centerLng, centerLat, lng, lat) < limit;
}
