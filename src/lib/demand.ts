// ─────────────────────────────────────────────────────────────────────────────
// What people actually open — so the ingest cron refreshes that first.
//
// THE PROBLEM THIS SOLVES. The sweep treats all 80 cities equally: 80 × 6
// categories × 3 pages = 1,440 fast-tier work items, walked in a fixed order.
// Measured on 2026-09-17, that list comes round about once every ELEVEN DAYS
// (592 of 7,026 rows refreshed in 24h ≈ 8.4%/day), because GitHub throttles the
// "every 30 minutes" schedule down to roughly every 3.4 hours and each run only
// gets through ~36 items.
//
// So "fresh" content was eleven days old, and the budget was spread evenly over
// Melbourne, Seoul and São Paulo — cities essentially nobody opened — while
// Vienna and Baden waited their turn behind them.
//
// THE FIX. Count what users ask for, and sort the work list by it. The same
// number of slices then buys hourly freshness where people actually are, at
// exactly the same cost. Nothing is dropped: the cold tail keeps its own
// guaranteed share of every sweep (see interleaveByDemand), so a city nobody has
// opened yet is still refreshed — just not as often as the home market.
//
// FULLY GATED: without Redis, recording is a no-op and the score map comes back
// empty, which makes the work list fall back to exactly the fixed order it uses
// today. Nothing changes until Upstash is configured.
// ─────────────────────────────────────────────────────────────────────────────

import { cacheHashIncr, cacheHashGetAll } from '@/lib/serverCache';

// Demand is bucketed by ISO-ish week so that interest DECAYS: a festival that
// made Salzburg busy last month should not keep Salzburg hot forever. We read
// this week and last week, weighting last week at half.
const PREV_WEEK_WEIGHT = 0.5;
const BUCKET_TTL_S = 21 * 24 * 60 * 60;   // 3 weeks — covers both live buckets

// ~11km cells. Coarse on purpose: a request from anywhere in a city should
// count towards that city, and we compare against the city-centre coordinates
// in the ingest work list, not against a precise user position.
const CELL = 10;   // one decimal place

function weekKey(at = Date.now()): string {
  // Whole weeks since the epoch. Not calendar weeks, and deliberately so —
  // no timezone or year-boundary edge cases, and the only property we need is
  // "advances once every 7 days".
  return `nova:demand:${Math.floor(at / (7 * 24 * 60 * 60 * 1000))}`;
}

/** The grid cell a coordinate falls in, e.g. "482:164" for Vienna. */
export function demandCell(lat: number, lng: number): string {
  return `${Math.round(lat * CELL)}:${Math.round(lng * CELL)}`;
}

function field(lat: number, lng: number, category: string): string {
  return `${demandCell(lat, lng)}:${category}`;
}

/**
 * Record that a user asked for this place and category. One HINCRBY, fire and
 * forget — never awaited on a path a user is waiting for.
 *
 * MUST NOT be called for the ingest cron's own requests. The cron fetches
 * /api/feed to do its work, so counting those would be a feedback loop: whatever
 * the sweep refreshed would look popular, and would then be refreshed first
 * forever, regardless of whether a single person ever opened it.
 */
export async function recordDemand(lat: number, lng: number, category: string): Promise<void> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  if (lat === 0 && lng === 0) return;            // unresolved geo, not a signal
  if (!category) return;
  await cacheHashIncr(weekKey(), field(lat, lng, category), BUCKET_TTL_S);
}

export type DemandMap = Record<string, number>;

/** Load this week's and last week's demand, merged and decayed. Two round trips. */
export async function loadDemand(): Promise<DemandMap> {
  const now = Date.now();
  const [thisWeek, lastWeek] = await Promise.all([
    cacheHashGetAll(weekKey(now)),
    cacheHashGetAll(weekKey(now - 7 * 24 * 60 * 60 * 1000)),
  ]);
  const merged: DemandMap = { ...thisWeek };
  for (const [k, v] of Object.entries(lastWeek)) {
    merged[k] = (merged[k] ?? 0) + v * PREV_WEEK_WEIGHT;
  }
  return merged;
}

/**
 * How wanted is this (place, category)?
 *
 * Sums the 3×3 block of cells around the point, because a city's centre
 * coordinates and a real user's position are rarely in the same ~11km cell —
 * someone in Floridsdorf asking about Vienna must count towards Vienna.
 *
 * Demand for the SAME PLACE in other categories counts too, at a quarter
 * weight: if people open Vienna at all, Vienna's other tabs are worth more than
 * a city nobody has ever opened. This is what stops a brand-new category from
 * being stuck at the back of the queue in a city that is obviously active.
 */
export function demandScore(map: DemandMap, lat: number, lng: number, category: string): number {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 0;
  const cx = Math.round(lat * CELL);
  const cy = Math.round(lng * CELL);

  let exact = 0;
  let anyCategory = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const prefix = `${cx + dx}:${cy + dy}:`;
      for (const [k, v] of Object.entries(map)) {
        if (!k.startsWith(prefix)) continue;
        anyCategory += v;
        if (k === `${prefix}${category}`) exact += v;
      }
    }
  }
  return exact + anyCategory * 0.25;
}

// How many wanted items to refresh for each long-tail one. 3:1 means three
// quarters of every sweep goes where people actually are, and the remaining
// quarter still walks the rest of the world so nothing is ever abandoned.
const HOT_PER_COLD = 3;

function hotPerCold(): number {
  const raw = (process.env.INGEST_HOT_PER_COLD ?? '').trim();
  if (raw === '') return HOT_PER_COLD;
  const n = parseInt(raw, 10);
  // 0 disables demand ordering entirely (pure round-robin, the old behaviour).
  if (!Number.isFinite(n) || n < 0) return HOT_PER_COLD;
  return n;
}

/**
 * Reorder a work list so wanted items come first, WITHOUT starving the rest.
 *
 * Returns a flat array, because the ingest route resumes across invocations with
 * a plain integer `?offset` and the GitHub workflow chains on the `nextOffset`
 * it returns. Changing the ORDER of that array changes what gets refreshed
 * first; changing its shape would break the chain.
 *
 * `coldCursor` rotates the long tail so that the cold slots land on different
 * items each sweep — otherwise the same handful of unwanted items would take the
 * cold quota every time and the actual tail would never move.
 */
export function interleaveByDemand<T>(
  items: T[],
  score: (item: T) => number,
  coldCursor = 0,
): T[] {
  const ratio = hotPerCold();
  if (ratio <= 0 || items.length === 0) return items;

  const hot: { item: T; score: number }[] = [];
  const cold: T[] = [];
  for (const item of items) {
    const s = score(item);
    if (s > 0) hot.push({ item, score: s }); else cold.push(item);
  }
  // Nothing measured yet (a fresh Redis, or no traffic): keep the given order
  // exactly, so the sweep behaves as it always has.
  if (hot.length === 0) return items;

  hot.sort((a, b) => b.score - a.score);
  const hotQ = hot.map(h => h.item);

  // Rotate the cold list so consecutive sweeps take different long-tail items.
  const rot = cold.length ? ((coldCursor % cold.length) + cold.length) % cold.length : 0;
  const coldQ = cold.length ? [...cold.slice(rot), ...cold.slice(0, rot)] : [];

  const out: T[] = [];
  let h = 0;
  let c = 0;
  while (h < hotQ.length || c < coldQ.length) {
    for (let i = 0; i < ratio && h < hotQ.length; i++) out.push(hotQ[h++]);
    if (c < coldQ.length) out.push(coldQ[c++]);
    // Hot is exhausted — the remaining cold items follow in rotated order.
    if (h >= hotQ.length) { while (c < coldQ.length) out.push(coldQ[c++]); }
  }
  return out;
}
