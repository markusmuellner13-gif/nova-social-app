// Local-first: is this post in the user's OWN town, or a neighbour's?
//
// The feed's promise is "your town first, all of it — then the towns around
// you". It used to draw the line with a 16 km ring for a town (22 km for a
// metro), which in Baden bei Wien already takes in Bad Vöslau (4.6 km),
// Traiskirchen (6.5 km) and Mödling (13 km) — measured 2026-11-12, Baden's
// "local" sightseeing was entirely Mödling's.
//
// Two signals decide, and both have to agree:
//   1. Distance. A town's own core is small (TOWN_CORE_KM); a metro's is the
//      metro ring the geocoder already chose for it.
//   2. The place the post names. "Stalltheater, Königstetten" is in
//      Königstetten whatever its pin says — and pins can be wrong (Eventbrite
//      listings used to be pinned at whichever town's page they were read from).
//
// Pure and synchronous: it runs in the browser on every page of the feed.

import type { Post } from '@/types';
import { sameCityish } from '@/lib/cityMatch';

/** A town's own core, from where the user stands. Baden's centre to its edge
 *  is ~4 km; Bad Vöslau's centre, the nearest other town, is 4.6 km away. */
export const TOWN_CORE_KM = 4.5;
/** The geocoder hands metros 22 km and towns 16 km (see useLocation). */
const METRO_LOCAL_KM_MIN = 20;

export interface UserPlace {
  city: string;
  lat: number;
  lng: number;
  /** The geocoder's local ring; ≥ 20 means a metro. */
  localKm?: number;
}

export function isMetro(user: Pick<UserPlace, 'localKm'>): boolean {
  return typeof user.localKm === 'number' && user.localKm >= METRO_LOCAL_KM_MIN;
}

/** Radius that holds the user's own town, and nothing much beyond it. */
export function cityCoreKm(user: Pick<UserPlace, 'localKm'>): number {
  return isMetro(user) ? (user.localKm as number) : TOWN_CORE_KM;
}

/** Radius to ASK the server for while filling the own-town phase. A little wider
 *  than the core so a venue on the edge isn't cut off; the classifier below
 *  draws the exact line. Whole km — the API parses an integer. */
export function cityFetchRadiusKm(user: Pick<UserPlace, 'localKm'>): number {
  return Math.ceil(cityCoreKm(user) + 1.5);
}

// Trailing parts of a place label that are not a town.
const NOT_A_TOWN = new Set([
  'austria', 'osterreich', 'oesterreich', 'germany', 'deutschland', 'switzerland', 'schweiz',
  'suisse', 'svizzera', 'liechtenstein', 'italy', 'italia', 'france', 'spain', 'espana',
  'usa', 'unitedstates', 'unitedstatesofamerica', 'uk', 'unitedkingdom', 'england',
  'netherlands', 'nederland', 'belgium', 'czechia', 'czechrepublic', 'hungary', 'poland',
  'portugal', 'ireland', 'denmark', 'sweden', 'norway', 'finland', 'greece', 'croatia',
  'slovakia', 'slovenia', 'canada', 'mexico', 'brazil', 'japan', 'australia',
  'niederosterreich', 'loweraustria', 'oberosterreich', 'upperaustria', 'steiermark',
  'styria', 'tirol', 'tyrol', 'karnten', 'carinthia', 'burgenland', 'vorarlberg',
  'bayern', 'bavaria', 'europe',
]);

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z]/g, '');
}

/**
 * The town a post's place label names, when it names one. Only labels of the
 * form "Venue, Town" count — a single-part label is as likely to be a venue
 * ("Ling's Kitchen") as a town, so it says nothing either way. Postcodes and
 * country/region suffixes are skipped ("…, 2500 Baden, Austria" → "Baden").
 */
export function townOfLabel(label: string | undefined | null): string | null {
  if (!label) return null;
  const parts = label.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  for (let i = parts.length - 1; i >= 1; i--) {
    const part = parts[i].replace(/\b\d{3,6}\b/g, '').replace(/\([A-Z]{2}\)/g, '').trim();
    if (!part || /\d/.test(part)) continue;              // a street number, not a town
    if (NOT_A_TOWN.has(fold(part))) continue;
    if (part.length > 40 || part.split(/\s+/).length > 4) return null;
    return part;
  }
  return null;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Kilometres from the user, from the post's own stamp or its pin. */
export function distanceFrom(post: Pick<Post, 'distanceKm' | 'location'>, user: Pick<UserPlace, 'lat' | 'lng'>): number | null {
  if (typeof post.distanceKm === 'number' && Number.isFinite(post.distanceKm)) return post.distanceKm;
  const lat = post.location?.lat, lng = post.location?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  if (!Number.isFinite(user.lat) || !Number.isFinite(user.lng)) return null;
  return haversineKm(user.lat, user.lng, lat as number, lng as number);
}

/** Is this post in the user's own town? */
export function isInUserCity(post: Pick<Post, 'distanceKm' | 'location'>, user: UserPlace): boolean {
  const town = townOfLabel(post.location?.name);
  // The post names another town → it's that town's, whatever its pin says.
  if (town && user.city && !sameCityish(town, user.city)) return false;
  const d = distanceFrom(post, user);
  if (d !== null) return d <= cityCoreKm(user);
  // No usable pin: trust a label that names the user's town; otherwise we can't
  // place it, and the honest default is "not provably here".
  return Boolean(town && user.city && sameCityish(town, user.city));
}

/** Split a list into [own town, everywhere else], keeping each side's order. */
export function splitLocal<T extends Pick<Post, 'distanceKm' | 'location'>>(posts: T[], user: UserPlace | null): [T[], T[]] {
  if (!user || !user.city) return [posts, []];
  const local: T[] = [], away: T[] = [];
  for (const p of posts) (isInUserCity(p, user) ? local : away).push(p);
  return [local, away];
}

/** Nearest first; posts we can't place go last, in their original order. */
export function byDistance<T extends Pick<Post, 'distanceKm' | 'location'>>(posts: T[], user: Pick<UserPlace, 'lat' | 'lng'>): T[] {
  return posts
    .map((p, i) => ({ p, i, d: distanceFrom(p, user) }))
    .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity) || a.i - b.i)
    .map(x => x.p);
}
