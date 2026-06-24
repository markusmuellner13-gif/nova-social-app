'use client';

// ── Batched "friends going" loader ────────────────────────────────────────────
// For each visible event post, which of the people you follow are going. Like
// the going-count loader, it batches every requested post id into ONE query
// (per 150ms window) and caches per session. Privacy is enforced by RLS — the
// query can only ever see followed-users' "going" rows.

import { getFriendsGoing, type FriendGoing } from './supabase';

let currentUserId: string | null = null;
const cache = new Map<string, FriendGoing[]>();
const pending = new Set<string>();
const waiters = new Map<string, ((f: FriendGoing[]) => void)[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

// Called when auth state changes — clears the cache so a new user doesn't see
// the previous user's friends.
export function setFriendsGoingUser(id: string | null) {
  if (id === currentUserId) return;
  currentUserId = id;
  cache.clear();
}

async function flush() {
  timer = null;
  const ids = [...pending];
  pending.clear();
  if (ids.length === 0) return;
  let result: Record<string, FriendGoing[]> = {};
  if (currentUserId) {
    try { result = await getFriendsGoing(currentUserId, ids); } catch { result = {}; }
  }
  for (const id of ids) {
    const f = result[id] ?? [];
    cache.set(id, f);
    const ws = waiters.get(id);
    waiters.delete(id);
    ws?.forEach(w => w(f));
  }
}

export function fetchFriendsGoing(postId: string): Promise<FriendGoing[]> {
  if (!currentUserId) return Promise.resolve([]);
  if (cache.has(postId)) return Promise.resolve(cache.get(postId)!);
  return new Promise<FriendGoing[]>(resolve => {
    const list = waiters.get(postId) ?? [];
    list.push(resolve);
    waiters.set(postId, list);
    pending.add(postId);
    if (!timer) timer = setTimeout(flush, 150);
  });
}
