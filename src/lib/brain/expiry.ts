// Nova Brain — JOB 7: keep finished events out of the user's own lists.
//
// The server already never SERVES an event whose day has passed (validation
// rejects it, every DB read filters `expires_at > now()`, and the hourly purge
// deletes the rows). What it cannot reach is what a user has kept on their own
// device: a saved, loved or "going" post is a snapshot in localStorage and in
// their synced interactions, and it used to sit in the profile forever — a
// concert from three weeks ago still listed under Saved.
//
// This is the single rule for "is this event over", used by the device-side
// clean-up (AppContext) and the feed's own cache filter (useAIFeed), so the two
// can never disagree about the same post.

import type { Post } from '@/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Today's date as YYYY-MM-DD in the user's OWN timezone. `toISOString()` is
 * UTC, which in Vienna kept yesterday's events alive until 01:00/02:00 local
 * time and in New York dropped tonight's events from 19:00/20:00.
 */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * An event is over once its date is before today. Today's events stay all day —
 * we only know the date reliably, not when the doors close. Posts without a
 * date (places, landmarks, restaurants) never expire.
 */
export function isEventOver(post: Pick<Post, 'eventDateRaw'> | null | undefined, today: string = localToday()): boolean {
  const raw = post?.eventDateRaw;
  if (!raw || !DATE_RE.test(raw)) return false;
  return raw.slice(0, 10) < today;
}

/** Drop finished events from a list of posts; everything else is untouched. */
export function withoutEndedEvents<T extends Pick<Post, 'eventDateRaw'>>(posts: T[], today: string = localToday()): T[] {
  return posts.filter(p => !isEventOver(p, today));
}

/**
 * Which of the user's kept posts are finished events. Looks only at ids that
 * are actually referenced (saved/loved/going), and only at their stored
 * snapshots — an id with no snapshot is left to the existing self-heal.
 */
export function findEndedInteractions(
  snapshots: Pick<Post, 'id' | 'eventDateRaw'>[],
  referencedIds: Iterable<string>,
  today: string = localToday(),
): Set<string> {
  const wanted = new Set(referencedIds);
  const ended = new Set<string>();
  for (const p of snapshots) {
    if (p?.id && wanted.has(p.id) && isEventOver(p, today)) ended.add(p.id);
  }
  return ended;
}
