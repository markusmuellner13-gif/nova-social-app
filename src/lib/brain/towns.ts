// Nova Brain — JOB 8: learn which towns to go and fill.
//
// The ingest sweep used to know exactly the ~80 cities hard-coded in its list.
// A user in a town that isn't on it (Bad Vöslau, Traiskirchen, Perchtoldsdorf…)
// only ever got what the live sources could find in the seconds they were
// waiting — and the database never learned the town existed.
//
// Now every town a real person opens is remembered (name, country, centre), and
// the sweep adds the most-opened ones to its own list. Interest decays: towns
// are counted per week and last week counts half, so a one-off visit fades and
// a place people keep opening stays on the list.
//
// Gated like the demand tracker: without Redis this records nothing and returns
// nothing, so the sweep's list is exactly the hard-coded one.

import { cacheHashIncr, cacheHashGetAll, cacheGet, cacheSet } from '@/lib/serverCache';
import { foldCity } from '@/lib/cityMatch';

export interface Town { city: string; country: string; lat: number; lng: number }

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BUCKET_TTL_S = 21 * 24 * 60 * 60;
const META_TTL_S = 60 * 24 * 60 * 60;
const PREV_WEEK_WEIGHT = 0.5;
// One write per town per server instance per this long — a popular town must
// not cost a Redis write on every page of every user's scroll.
const RECORD_EVERY_MS = 10 * 60 * 1000;
const lastRecorded = new Map<string, number>();

function hitsKey(at: number): string {
  return `nova:brain:towns:${Math.floor(at / WEEK_MS)}`;
}

export function townSlug(city: string, country: string): string {
  return `${foldCity(city)}|${foldCity(country)}`.slice(0, 80);
}

/** A real user opened this town. Fire and forget; never on a waiting path. */
export async function recordTownVisit(city: string, country: string, lat: number, lng: number): Promise<void> {
  const name = (city || '').trim();
  if (!name || name.length > 60 || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  if (lat === 0 && lng === 0) return;
  const slug = townSlug(name, country || '');
  if (!foldCity(name)) return;
  const now = Date.now();
  if ((lastRecorded.get(slug) ?? 0) > now - RECORD_EVERY_MS) return;
  lastRecorded.set(slug, now);
  if (lastRecorded.size > 5_000) lastRecorded.clear();
  await Promise.all([
    cacheHashIncr(hitsKey(now), slug, BUCKET_TTL_S),
    // Where to search from: the position rounded to ~1 km. Deliberately coarse —
    // this is a TOWN's search point, never a person's, and 1 km is far below the
    // radius the sweep searches with. No user id is ever stored with it.
    cacheSet(`nova:brain:town:${slug}`, {
      city: name, country: (country || '').trim(),
      lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100,
    } satisfies Town, META_TTL_S),
  ]);
}

/** The most-opened towns, most-opened first. */
export async function loadLearnedTowns(max = 60): Promise<Town[]> {
  const now = Date.now();
  const [thisWeek, lastWeek] = await Promise.all([
    cacheHashGetAll(hitsKey(now)),
    cacheHashGetAll(hitsKey(now - WEEK_MS)),
  ]);
  const score: Record<string, number> = { ...thisWeek };
  for (const [k, v] of Object.entries(lastWeek)) score[k] = (score[k] ?? 0) + v * PREV_WEEK_WEIGHT;
  const top = Object.entries(score).sort((a, b) => b[1] - a[1]).slice(0, max);
  const metas = await Promise.all(top.map(([slug]) => cacheGet<Town>(`nova:brain:town:${slug}`).catch(() => null)));
  return metas.filter((t): t is Town => Boolean(t && t.city && Number.isFinite(t.lat) && Number.isFinite(t.lng)));
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, r = (d: number) => (d * Math.PI) / 180;
  const s = Math.sin(r(b.lat - a.lat) / 2) ** 2
    + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * The sweep's list: its own cities first, then each learned town that isn't
 * already covered — "covered" meaning a listed place within `minKm`, so two
 * people opening Vienna from different districts don't add Vienna twice.
 */
export function mergeTowns(fixed: Town[], learned: Town[], minKm = 4): Town[] {
  const out = [...fixed];
  for (const t of learned) {
    if (out.some(o => km(o, t) < minKm)) continue;
    out.push(t);
  }
  return out;
}
