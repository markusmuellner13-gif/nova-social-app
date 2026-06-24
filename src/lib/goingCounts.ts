'use client';

// ── Batched "I'm going" count loader ──────────────────────────────────────────
// Each event post wants its real RSVP count, but firing one request per post
// would be wasteful. This collects every post id requested within a short window
// and resolves them all with ONE going_counts RPC call, caching the results for
// the session. Returns a real aggregate (0 when nobody has marked going yet) —
// never a fabricated number.

import { getGoingCounts } from './supabase';

const cache = new Map<string, number>();
const pending = new Set<string>();
const waiters = new Map<string, ((n: number) => void)[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const ids = [...pending];
  pending.clear();
  if (ids.length === 0) return;
  let counts: Record<string, number> = {};
  try {
    counts = await getGoingCounts(ids);
  } catch {
    counts = {};
  }
  for (const id of ids) {
    const n = counts[id] ?? 0;
    cache.set(id, n);
    const ws = waiters.get(id);
    waiters.delete(id);
    ws?.forEach(w => w(n));
  }
}

export function fetchGoingCount(postId: string): Promise<number> {
  if (cache.has(postId)) return Promise.resolve(cache.get(postId)!);
  return new Promise<number>(resolve => {
    const list = waiters.get(postId) ?? [];
    list.push(resolve);
    waiters.set(postId, list);
    pending.add(postId);
    if (!timer) timer = setTimeout(flush, 150);
  });
}

// After the user toggles going, the cached aggregate is stale — drop it so the
// next mount/refetch reflects the change.
export function invalidateGoingCount(postId: string) {
  cache.delete(postId);
}
