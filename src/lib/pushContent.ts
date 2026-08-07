// ─────────────────────────────────────────────────────────────────────────────
// WHICH push notification to send — never what it says.
//
// This file used to do both, and that was the bug. It wrote English prose with
// the event's own title interpolated into it, so a German user in Vienna got:
//
//   "Tonight in Vienna 🌃"
//   "Endlich ist es so weit: Alegría öffnet seine… +7 more near you. Make plans →"
//
// Two languages in one notification, and the interesting half truncated.
//
// Selection is language-independent; wording is not. So selection stays here
// and returns only a `PushKind` plus a real count, and every word the user
// actually reads comes from src/lib/pushCopy.ts in their own profile language.
//
// The English builders (buildSmartPush / buildDigest / buildTonight /
// buildMorning / buildForInterest / buildDiscovery / buildGenericNudge /
// buildFriendGoingPush and their rotation tables) were DELETED rather than left
// in place. They were unreachable once the cron switched over, and a dormant
// second way to write a notification is exactly how the mixed-language path
// would come back.
//
// Pure & framework-free → unit testable.
// ─────────────────────────────────────────────────────────────────────────────

import type { ApiPost } from '@/lib/sources/shared';
import type { PushKind } from '@/lib/pushCopy';

/** A post only counts as a real event if it has something to show for itself. */
function titleOf(p: ApiPost): string { return (p.caption?.split('\n')[0] ?? '').trim(); }

/** Whole days between `dateRaw` (YYYY-MM-DD) and local midnight today. */
function daysAway(dateRaw: string | null | undefined, now: Date): number | null {
  if (!dateRaw) return null;
  const d = new Date(`${dateRaw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - start.getTime()) / 86_400_000);
}

function isToday(dateRaw: string | null | undefined, now: Date): boolean {
  return daysAway(dateRaw, now) === 0;
}

function isWeekendish(dateRaw: string | null | undefined, now: Date): boolean {
  const days = daysAway(dateRaw, now);
  if (days === null || days < 0 || days > 9) return false;
  const dow = new Date(`${dateRaw}T00:00:00`).getDay();
  return dow === 5 || dow === 6 || dow === 0; // Fri/Sat/Sun soon
}

interface SmartInput {
  events: ApiPost[];
  categories?: string[];   // the user's learned top interests
  now?: Date;
}

/**
 * Which nudge fits right now, and how many things it is about.
 *
 * The count is REAL and is rendered verbatim by pushCopy, so "3 things on
 * tonight" must mean three things are actually on tonight — the app's
 * real-content ethos applies to its notifications too.
 */
export function chooseSmartPush(
  { events, categories = [], now = new Date() }: SmartInput,
): { kind: PushKind; count: number } {
  const hour = now.getHours();
  const dow = now.getDay();

  const upcoming = events
    .filter((e) => titleOf(e))
    .sort((a, b) => ((a.eventDateRaw ?? '9999') < (b.eventDateRaw ?? '9999') ? -1 : 1));

  if (upcoming.length === 0) return { kind: 'discover', count: 0 };

  // Thu/Fri → weekend roundup, when the weekend actually has something in it.
  const weekendEvents = upcoming.filter((e) => isWeekendish(e.eventDateRaw, now));
  if ((dow === 4 || dow === 5) && weekendEvents.length >= 3) {
    return { kind: 'weekend', count: weekendEvents.length };
  }

  const todays = upcoming.filter((e) => isToday(e.eventDateRaw, now));

  // Evening + something on today → "tonight".
  if (hour >= 16 && hour < 24 && todays.length > 0) {
    return { kind: 'tonight', count: todays.length };
  }

  // Morning → today's brief.
  if (hour >= 5 && hour < 11) {
    return { kind: 'today', count: todays.length || upcoming.length };
  }

  // An interest match still earns the nudge — it just no longer quotes the
  // event, so `categories` only affects whether we bother, not the wording.
  const matched = categories.length
    ? upcoming.filter((e) => categories.includes(e.category ?? ''))
    : [];
  return { kind: 'nearby', count: matched.length || upcoming.length };
}
