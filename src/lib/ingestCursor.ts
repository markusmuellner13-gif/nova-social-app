// ─────────────────────────────────────────────────────────────────────────────
// Where the sweep got to — so a scheduled run can pick up on its own.
//
// The ingest route used to resume only via `?offset`, which meant something
// OUTSIDE the app had to read `nextOffset` from one response and pass it to the
// next request. That something was a GitHub Action, and it was the weakest part
// of the whole pipeline: GitHub throttles scheduled workflows hard (a `*/30`
// schedule actually fired about every 3.4 hours), the chain stopped dead if any
// single slice failed to answer, and the app could not refresh itself without
// an external driver.
//
// With the position stored here instead, a plain Vercel cron is enough: every
// run reads where the last one stopped, does a slice, and writes back. No chain
// to break, and the schedule is the platform's rather than GitHub's.
//
// TWO cursors, not one — see buildSweepQueue in src/lib/demand.ts. The wanted
// items and the long tail advance at their own pace, which is the entire point
// of ranking by demand.
//
// FULLY GATED: without Redis both reads return null and the caller falls back to
// a time-derived position, so a scheduled run still advances — just without
// remembering precisely where it was.
// ─────────────────────────────────────────────────────────────────────────────

import { cacheGet, cacheSet } from '@/lib/serverCache';

// Long TTL: this is a position, not a cache. It should survive a quiet weekend.
const TTL_S = 30 * 24 * 60 * 60;

export interface SweepCursor {
  hot: number;
  cold: number;
}

function key(tier: string): string {
  return `nova:ingest:cursor:${tier || 'all'}`;
}

/** Where the last scheduled run stopped, or null when nothing is remembered. */
export async function readCursor(tier: string): Promise<SweepCursor | null> {
  const raw = await cacheGet<SweepCursor>(key(tier));
  if (!raw) return null;
  const hot = Number(raw.hot);
  const cold = Number(raw.cold);
  if (!Number.isFinite(hot) || !Number.isFinite(cold)) return null;
  return { hot: Math.max(0, Math.floor(hot)), cold: Math.max(0, Math.floor(cold)) };
}

/** Remember where this run stopped. Best effort — never fails a sweep. */
export async function writeCursor(tier: string, cursor: SweepCursor): Promise<void> {
  await cacheSet(key(tier), {
    hot: Math.max(0, Math.floor(cursor.hot)),
    cold: Math.max(0, Math.floor(cursor.cold)),
  }, TTL_S).catch(() => {});
}

/**
 * Where to start when nothing is remembered (no Redis, or a first run).
 *
 * Derived from the clock so that consecutive runs still land on DIFFERENT work
 * — a fixed 0 would make every unremembered run redo the same handful of items
 * forever, which is worse than the rotation this replaces. `perRun` is roughly
 * how many items an invocation gets through, so each tick moves on by about one
 * invocation's worth.
 */
export function timeDerivedCursor(tickMs: number, perRun: number): number {
  if (!Number.isFinite(tickMs) || tickMs <= 0) return 0;
  return Math.floor(Date.now() / tickMs) * Math.max(1, perRun);
}
