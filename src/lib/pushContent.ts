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
    { title: `${place}, rediscovered 🗺️`,   body: `Cafés, bars, museums, parks & hidden gems near you. Take a look →` },
    { title: `Your weekly Nova pulse 📡`,   body: `New spots and things to do around ${place}. Tap to catch up →` },
  ];
  return variants[(dayOfYear(now) + 1) % variants.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// The rich notification library. buildSmartPush() is the single entry point the
// cron uses: it reads the moment (time of day, day of week), the real events
// near the user, AND the user's learned interests, then picks the archetype that
// fits and rotates the wording so two days never feel the same. Everything stays
// HONEST — it never claims a time, a count, or an interest that isn't real.
// ─────────────────────────────────────────────────────────────────────────────

// Friendly per-category framing for an interest-matched push.
const CAT_VOICE: Record<string, { who: string; verb: string }> = {
  music:       { who: 'music lovers',  verb: 'Live music' },
  events:      { who: 'you',           verb: 'Events' },
  sports:      { who: 'sports fans',   verb: 'Games & matches' },
  art:         { who: 'culture lovers',verb: 'Art & culture' },
  food:        { who: 'foodies',       verb: 'Food' },
  restaurants: { who: 'foodies',       verb: 'Places to eat' },
  venues:      { who: 'night owls',    verb: 'Nights out' },
  sightseeing: { who: 'explorers',     verb: 'Sights' },
  community:   { who: 'locals',        verb: 'Community happenings' },
  fitness:     { who: 'the active',    verb: 'Ways to move' },
  nightlife:   { who: 'night owls',    verb: 'Nightlife' },
};

function isToday(dateRaw: string | null | undefined, now: Date): boolean {
  if (!dateRaw) return false;
  return relativeWhen(dateRaw, now) === 'today';
}

// Spread variants across BOTH the day and the individual user (seed), so a city
// of users doesn't all get the identical line on the same morning.
function rotate<T>(variants: T[], now: Date, seed: number): T {
  return variants[(dayOfYear(now) + seed) % variants.length];
}

// ── Morning brief (≈6–11am): start-the-day energy ────────────────────────────
function buildMorning(city: string, top: ApiPost | undefined, count: number, now: Date, seed: number): PushMessage {
  const e1 = top ? trim(titleOf(top), 40) : '';
  const variants: PushMessage[] = [
    { title: `Good morning, ${city} ☀️`, body: count > 0 ? `${count} thing${count === 1 ? '' : 's'} to do today near you${e1 ? ` — starting with ${e1}` : ''}. Plan your day →` : `Fresh spots & plans near you today. Start exploring →` },
    { title: `Rise & explore ☕`,         body: e1 ? `${e1} and more happening around ${city} today. Tap to see →` : `New things to do around ${city} today. Tap to see →` },
    { title: `Your ${city} day, sorted 🌤️`, body: count > 0 ? `${count} event${count === 1 ? '' : 's'} near you today — coffee first, then go. →` : `Cafés, culture & things to do near you today →` },
  ];
  return rotate(variants, now, seed);
}

// ── Tonight (≈17–23, something on today): going-out energy ────────────────────
function buildTonight(city: string, top: ApiPost, others: number, now: Date, seed: number): PushMessage {
  const e1 = trim(titleOf(top), 44);
  const emoji = emojiFor(top.category);
  const plus = others > 0 ? ` +${others} more near you` : '';
  const variants: PushMessage[] = [
    { title: `Tonight in ${city} ${emoji}`, body: `${e1}${plus}. Make plans →` },
    { title: `${e1} — tonight 🌃`,          body: `On near you in ${city}${plus}. Tap for details →` },
    { title: `Out tonight? ${city} is on ✨`, body: `${e1}${plus}. See what's good →` },
  ];
  return rotate(variants, now, seed);
}

// ── Interest-matched: leads with the user's actual top interest ───────────────
function buildForInterest(city: string, cat: string, top: ApiPost, others: number, now: Date, seed: number): PushMessage {
  const voice = CAT_VOICE[cat] ?? { who: 'you', verb: 'Things' };
  const e1 = trim(titleOf(top), 44);
  const when = relativeWhen(top.eventDateRaw, now);
  const plus = others > 0 ? ` +${others} more` : '';
  const emoji = emojiFor(cat);
  const variants: PushMessage[] = [
    { title: `${emoji} For ${voice.who} in ${city}`, body: when ? `${e1} ${when}${plus}. Right up your street →` : `${e1}${plus} near you. Right up your street →` },
    { title: `${emoji} ${voice.verb} near you`,       body: when ? `${e1} ${when} in ${city}${plus}. Tap to explore →` : `${e1} in ${city}${plus}. Tap to explore →` },
    { title: `Because you love ${cat} ${emoji}`,      body: when ? `${e1} ${when}${plus} near you. Don't miss it →` : `${e1}${plus} near you. Don't miss it →` },
  ];
  return rotate(variants, now, seed);
}

// ── Discovery nudge when there are no dated events but a place still has life ──
function buildDiscovery(city: string, categories: string[], now: Date, seed: number): PushMessage {
  const cat = categories[0];
  if (cat && CAT_VOICE[cat]) {
    const emoji = emojiFor(cat);
    const voice = CAT_VOICE[cat];
    const variants: PushMessage[] = [
      { title: `${emoji} ${voice.verb} around ${city}`, body: `New ${cat} spots near you to check out. Take a look →` },
      { title: `${emoji} For ${voice.who}`,             body: `We lined up ${cat} near you in ${city}. Tap to explore →` },
    ];
    return rotate(variants, now, seed);
  }
  return buildGenericNudge(city, now);
}

interface SmartInput {
  city: string;
  events: ApiPost[];
  categories?: string[];   // the user's learned top interests
  now?: Date;
  seed?: number;           // per-user spread
}

// The cron's single call. Always returns a message (never null).
export function buildSmartPush({ city, events, categories = [], now = new Date(), seed = 0 }: SmartInput): PushMessage {
  const place = city || 'your area';
  const hour = now.getHours();
  const dow = now.getDay();

  const upcoming = events
    .filter(e => titleOf(e))
    .sort((a, b) => (a.eventDateRaw ?? '9999') < (b.eventDateRaw ?? '9999') ? -1 : 1);

  // No real dated events → discovery / generic (still honest, still varied).
  if (upcoming.length === 0) return buildDiscovery(place, categories, now, seed);

  // 1) Weekend roundup on Thu/Fri keeps its own strong format.
  const weekendEvents = upcoming.filter(e => isWeekendish(e.eventDateRaw, now));
  if ((dow === 4 || dow === 5) && weekendEvents.length >= 3) {
    const digest = buildDigest({ city: place, events, now });
    if (digest) return digest;
  }

  // 2) Personalise: if the user's interests match an upcoming event, lead with it.
  const match = categories.length
    ? upcoming.find(e => categories.includes(e.category ?? ''))
    : undefined;
  if (match) {
    const others = upcoming.length - 1;
    return buildForInterest(place, match.category ?? 'events', match, others, now, seed);
  }

  // 3) Evening + something on today → "tonight".
  if (hour >= 16 && hour < 24 && isToday(upcoming[0].eventDateRaw, now)) {
    return buildTonight(place, upcoming[0], upcoming.length - 1, now, seed);
  }

  // 4) Morning → a "plan your day" brief.
  if (hour >= 5 && hour < 11) {
    const todays = upcoming.filter(e => isToday(e.eventDateRaw, now));
    return buildMorning(place, todays[0] ?? upcoming[0], todays.length, now, seed);
  }

  // 5) Otherwise the trusty rotating multi-event digest.
  return buildDigest({ city: place, events, now }) ?? buildGenericNudge(place, now);
}
