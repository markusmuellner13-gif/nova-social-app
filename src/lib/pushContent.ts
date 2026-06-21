// ─────────────────────────────────────────────────────────────────────────────
// Push notification copywriting.
//
// Turns "the events near this user" into a notification that actually makes
// someone open the app — varied (rotates daily so it never feels robotic),
// time-aware ("tonight" / "this weekend"), and HONEST (it never claims a time or
// a count that isn't true, matching the app's real-content ethos).
//
// Pure & framework-free → unit testable. The cron (/api/cron/push) calls
// buildDigest() with the user's city + nearby events, and buildGenericNudge()
// when we have no event data for them.
// ─────────────────────────────────────────────────────────────────────────────

import type { ApiPost } from '@/lib/sources/shared';

export interface PushMessage { title: string; body: string }

const CAT_EMOJI: Record<string, string> = {
  events: '🎉', music: '🎵', sports: '⚽', art: '🎨', community: '🤝',
  venues: '🎭', restaurants: '🍽️', food: '🍕', hotels: '🏨', rentals: '🚲',
  sightseeing: '🏛️', shops: '🛍️', fitness: '💪', lifestyle: '🌟',
  tech: '💻', fashion: '👗', travel: '✈️', pets: '🐾',
};

function emojiFor(cat?: string): string { return CAT_EMOJI[cat ?? ''] ?? '🎉'; }
function titleOf(p: ApiPost): string { return (p.caption?.split('\n')[0] ?? '').trim(); }
function cap(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// Trim a headline so the notification stays tidy across devices.
function trim(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

const DOW_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A friendly, accurate relative phrase for a YYYY-MM-DD date. Empty string when
// unknown/past so callers never print a misleading time.
export function relativeWhen(dateRaw: string | null | undefined, now: Date = new Date()): string {
  if (!dateRaw) return '';
  const d = new Date(`${dateRaw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - start.getTime()) / 86_400_000);
  if (days < 0) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 6) return `this ${DOW_FULL[d.getDay()]}`;
  if (days <= 13) return `next ${DOW_FULL[d.getDay()]}`;
  return `on ${DOW_SHORT[d.getDay()]} ${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
}

function dayOfYear(now: Date): number {
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

function isWeekendish(dateRaw: string | null | undefined, now: Date): boolean {
  if (!dateRaw) return false;
  const d = new Date(`${dateRaw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - start.getTime()) / 86_400_000);
  const dow = d.getDay();
  return days >= 0 && days <= 9 && (dow === 5 || dow === 6 || dow === 0); // Fri/Sat/Sun soon
}

interface DigestInput { city: string; events: ApiPost[]; now?: Date }

// Build the personalised digest. Returns null when there are no usable events
// (caller falls back to buildGenericNudge).
export function buildDigest({ city, events, now = new Date() }: DigestInput): PushMessage | null {
  const upcoming = events
    .filter(e => titleOf(e))
    .sort((a, b) => (a.eventDateRaw ?? '9999') < (b.eventDateRaw ?? '9999') ? -1 : 1);
  if (upcoming.length === 0) return null;

  const top = upcoming[0];
  const e1 = trim(titleOf(top), 46);
  const emoji = emojiFor(top.category);
  const when = relativeWhen(top.eventDateRaw, now);
  const total = upcoming.length;
  const others = total - 1;
  const dow = now.getDay();

  // ── Weekend roundup: Thu/Fri, when there's a real weekend lineup ──────────
  const weekendEvents = upcoming.filter(e => isWeekendish(e.eventDateRaw, now));
  if ((dow === 4 || dow === 5) && weekendEvents.length >= 3) {
    const a = trim(titleOf(weekendEvents[0]), 30);
    const b = trim(titleOf(weekendEvents[1]), 30);
    return {
      title: `Your ${city} weekend 🔥`,
      body: `${a}, ${b} & ${weekendEvents.length - 2} more events near you. Tap to plan the weekend →`,
    };
  }

  // ── Single event: keep it clean, no fake "+0 more" ────────────────────────
  if (others <= 0) {
    return {
      title: `${emoji} ${e1}`,
      body: when ? `${cap(when)} in ${city}. Tap for details →` : `Happening near you in ${city}. Tap for details →`,
    };
  }

  // ── Multi-event: rotate daily so the copy never feels repetitive ──────────
  const moreEvents = `${others} more event${others === 1 ? '' : 's'}`;
  const variants: PushMessage[] = [
    {
      title: `${emoji} ${e1}`,
      body: when ? `${cap(when)} in ${city} · +${moreEvents} near you. Tap to explore →`
                 : `Near you in ${city} · +${moreEvents}. Tap to explore →`,
    },
    {
      title: `${city} is buzzing ${emoji}`,
      body: when ? `${e1} ${when}, plus ${moreEvents} happening near you. Don't miss out →`
                 : `${e1}, plus ${moreEvents} near you right now. Don't miss out →`,
    },
    {
      title: `Don't miss ${e1} 👀`,
      body: when ? `${cap(when)} in ${city} — and ${moreEvents} more to discover. Tap →`
                 : `On near you in ${city} — and ${moreEvents} more. Tap →`,
    },
    {
      title: `What's on in ${city}? ${emoji}`,
      body: when ? `Starting with ${e1} ${when} + ${moreEvents}. See what's good →`
                 : `${e1} + ${moreEvents} near you. See what's good →`,
    },
  ];
  return variants[dayOfYear(now) % variants.length];
}

// Fallback when we have no event data for the user (no saved coords yet, or DB
// empty for their area). Still varied, still inviting — never a dead "open the
// app" nag.
export function buildGenericNudge(city: string | null | undefined, now: Date = new Date()): PushMessage {
  const place = city || 'your area';
  const variants: PushMessage[] = [
    { title: `New events near you ✨`,      body: `Fresh events just landed in ${place}. Open Nova to see what's on →` },
    { title: `What's on in ${place}? 🎉`,   body: `Discover events, live music, food & more happening around you →` },
    { title: `Your ${place} radar 📍`,      body: `New things to do near you this week. Tap to explore →` },
    { title: `Bored? Not in ${place} 👀`,   body: `There's stuff happening near you right now. Come find it →` },
  ];
  return variants[dayOfYear(now) % variants.length];
}
