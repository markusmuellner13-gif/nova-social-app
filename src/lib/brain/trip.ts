// Trip briefing — "I'm going to Rome in three weeks, what should I do?"
//
// This is the second half of what Nova is for. The feed answers "what's around
// me"; this answers "what should I do when I get there", which is the thing
// people currently open six browser tabs and a search engine for.
//
// Everything in the output is grounded in data we actually hold: real sights
// from Wikipedia, real events with real dates from the ticketing sources, real
// places from OpenStreetMap. The crowd advice is derived from opening hours and
// relative prominence — never invented. If we don't know something, we say so
// rather than filling the gap with plausible-sounding travel-blog prose.

import type { ApiPost } from '@/lib/sources/shared';
import { prominence, isChain } from './prominence';

// ─────────────────────────────────────────────────────────────────────────────
// Understanding the question
// ─────────────────────────────────────────────────────────────────────────────

export interface TripQuery {
  /** The place they named, if any ("rome", "new york"). */
  destination: string | null;
  /** Days from today the trip starts, when they said. */
  inDays: number | null;
  /** How long the window runs, in days. */
  spanDays: number;
  /** Human label for the window ("in 3 weeks", "next month"). */
  whenLabel: string | null;
  /** True when this reads as trip planning rather than "what's on tonight". */
  isTrip: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

// Phrases that mean "I am travelling somewhere", as opposed to asking about here.
const TRIP_MARKERS = /\b(go(?:ing)?|travel(?:l?ing)?|fly(?:ing)?|visit(?:ing)?|trip|holiday|vacation|weekend away|city break|heading|will be|i'?m in)\b/;

// Words that can follow "to" but are not a place.
const NOT_A_PLACE = new Set([
  'see', 'do', 'visit', 'go', 'eat', 'the', 'a', 'an', 'my', 'your', 'be',
  'find', 'know', 'get', 'stay', 'avoid', 'travel', 'take', 'have',
]);

function parseWhen(m: string): { inDays: number | null; spanDays: number; label: string | null } {
  // "in 3 weeks", "in three days", "in 2 months"
  const rel = m.match(/\bin\s+(\d+|[a-z]+)\s+(day|week|month)s?\b/);
  if (rel) {
    const n = /^\d+$/.test(rel[1]) ? parseInt(rel[1], 10) : NUMBER_WORDS[rel[1]];
    if (n && n > 0 && n < 100) {
      const mult = rel[2] === 'day' ? 1 : rel[2] === 'week' ? 7 : 30;
      const inDays = n * mult;
      // A trip's useful window widens the further out it is.
      const span = rel[2] === 'day' ? 4 : rel[2] === 'week' ? 7 : 14;
      return { inDays, spanDays: span, label: `in ${n} ${rel[2]}${n > 1 ? 's' : ''}` };
    }
  }
  if (/\bnext week\b/.test(m)) return { inDays: 7, spanDays: 7, label: 'next week' };
  if (/\bnext month\b/.test(m)) return { inDays: 30, spanDays: 14, label: 'next month' };
  if (/\bnext weekend\b/.test(m)) return { inDays: 7, spanDays: 3, label: 'next weekend' };
  if (/\bthis weekend\b/.test(m)) return { inDays: 0, spanDays: 3, label: 'this weekend' };
  if (/\btomorrow\b/.test(m)) return { inDays: 1, spanDays: 1, label: 'tomorrow' };

  // "in September", "in march"
  const monthIdx = MONTHS.findIndex(mo => new RegExp(`\\b(in|during|for)\\s+${mo}\\b`).test(m));
  if (monthIdx >= 0) {
    const now = new Date();
    const year = monthIdx < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
    const start = new Date(Date.UTC(year, monthIdx, 1));
    const inDays = Math.max(0, Math.round((start.getTime() - Date.now()) / 86_400_000));
    return { inDays, spanDays: 30, label: `in ${MONTHS[monthIdx][0].toUpperCase()}${MONTHS[monthIdx].slice(1)}` };
  }
  return { inDays: null, spanDays: 14, label: null };
}

function parseDestination(raw: string): string | null {
  // "to Rome", "to New York", "in Barcelona" — take the capitalised run that
  // follows, which is how people actually write place names.
  const patterns = [
    /\b(?:to|in|visiting|visit)\s+([A-ZÀ-Þ][\w'’-]*(?:\s+[A-ZÀ-Þ][\w'’-]*){0,2})/,
    /\b(?:to|in)\s+([a-zà-þ][\w'’-]*(?:\s+[a-zà-þ][\w'’-]*){0,1})\s+(?:in|next|this|for|during|\?|$)/,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    const cand = m?.[1]?.trim();
    if (!cand) continue;
    const first = cand.split(/\s+/)[0].toLowerCase();
    if (NOT_A_PLACE.has(first)) continue;
    if (cand.length < 2 || cand.length > 40) continue;
    // Don't mistake a time expression for a city.
    if (MONTHS.includes(first) || /^\d/.test(cand)) continue;
    return cand;
  }
  return null;
}

export function parseTripQuery(message: string): TripQuery {
  const raw = message.trim();
  const m = ` ${raw.toLowerCase()} `;
  const when = parseWhen(m);
  const destination = parseDestination(raw);

  // It's a trip question if they named a destination AND either said when, or
  // used travel language, or asked the classic planning questions.
  const planningWords = /\b(what.*(see|do|visit|worth)|itinerary|things to do|must.see|recommend|avoid.*(crowd|tourist|queue)|hidden gem)\b/.test(m);
  const isTrip = Boolean(destination) && (TRIP_MARKERS.test(m) || when.inDays !== null || planningWords);

  return {
    destination,
    inDays: when.inDays,
    spanDays: when.spanDays,
    whenLabel: when.label,
    isTrip,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Building the briefing
// ─────────────────────────────────────────────────────────────────────────────

export interface TripInput {
  city: string;
  whenLabel: string | null;
  from: string;              // YYYY-MM-DD
  to: string;                // YYYY-MM-DD
  sights: ApiPost[];
  events: ApiPost[];
  food: ApiPost[];
  outdoors: ApiPost[];
}

const title = (p: ApiPost) => (p.caption?.split('\n')[0] ?? p.organizer ?? '').trim();

/** Short name for a place — the organiser/venue rather than the sentence. */
function name(p: ApiPost): string {
  const n = (p.organizer || p.user?.name || '').trim();
  if (n && n.length <= 60) return n;
  const t = title(p);
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

function prettyDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return iso; }
}

/** Opening-hours hint from the OSM caption, when the place published one. */
function opensAt(p: ApiPost): string | null {
  const m = p.caption?.match(/🕒\s*([^\n]+)/);
  return m?.[1]?.trim() ?? null;
}

/**
 * Crowd advice, derived rather than invented.
 *
 * The honest logic: the most prominent sights are the ones everyone else has
 * also put on their list, so they are where the queues are. We say that, name
 * the quieter alternatives we actually found in the same city, and use real
 * opening hours where the place published them. We never claim to know live
 * queue lengths, because we don't.
 */
export function crowdAdvice(sights: ApiPost[]): string[] {
  const ranked = [...sights].sort((a, b) => prominence(b) - prominence(a));
  const busiest = ranked.slice(0, 3).filter(p => prominence(p) > 0.4);
  const quieter = ranked.slice(3).filter(p => prominence(p) >= 0.25).slice(0, 3);

  const out: string[] = [];
  if (busiest.length) {
    const opening = busiest.map(opensAt).find(Boolean);
    out.push(
      `${busiest.map(name).join(', ')} ${busiest.length > 1 ? 'are' : 'is'} the best-known — which is exactly why ${busiest.length > 1 ? 'they get' : 'it gets'} busy. Go in the first hour after opening${opening ? ` (${opening})` : ''} or in the last two before closing.`
    );
  }
  if (quieter.length) {
    out.push(`Quieter and genuinely worth it: ${quieter.map(name).join(', ')}.`);
  }
  out.push('Weekday mornings beat weekends everywhere; the middle of the day is the worst time at any headline sight.');
  return out;
}

/** Compose the full briefing. Sections with no real data are simply omitted. */
export function buildTripBriefing(input: TripInput): string {
  const { city, whenLabel, from, to } = input;
  const when = whenLabel ? ` ${whenLabel}` : '';
  const lines: string[] = [];

  lines.push(`**${city}${when}** — here's what I'd plan around. 🧭`);

  // ── What's actually worth seeing ──
  const sights = [...input.sights].sort((a, b) => prominence(b) - prominence(a)).slice(0, 6);
  if (sights.length) {
    lines.push('', '**Worth seeing**');
    for (const s of sights) {
      const hrs = opensAt(s);
      // Only mention distance when it's actually informative — everything in a
      // compact old centre reads "0.0 km", which tells the reader nothing.
      const far = s.distanceKm != null && s.distanceKm >= 0.4
        ? ` — ${s.distanceKm < 10 ? s.distanceKm.toFixed(1) : Math.round(s.distanceKm)} km from the centre`
        : '';
      lines.push(`• *${name(s)}*${far}${hrs ? ` · ${hrs}` : ''}`);
    }
  }

  // ── What's ON while they're there (the bit a guidebook can't do) ──
  const events = input.events
    .filter(e => e.eventDateRaw && e.eventDateRaw >= from && e.eventDateRaw <= to)
    .sort((a, b) => (a.eventDateRaw ?? '') < (b.eventDateRaw ?? '') ? -1 : 1)
    .slice(0, 6);
  if (events.length) {
    lines.push('', `**On while you're there** (${prettyDate(from)} – ${prettyDate(to)})`);
    for (const e of events) {
      lines.push(`• *${title(e).slice(0, 70)}* — ${prettyDate(e.eventDateRaw)}${e.eventVenue ? ` · ${e.eventVenue.split(',')[0]}` : ''}`);
    }
  } else {
    lines.push('', `**On while you're there**`, `I don't have confirmed listings for ${prettyDate(from)} – ${prettyDate(to)} yet — most venues publish 3–6 weeks ahead, so check back closer to the date and I'll have more.`);
  }

  // ── Eating ──
  const food = input.food.filter(p => !isChain(name(p))).sort((a, b) => prominence(b) - prominence(a)).slice(0, 4);
  if (food.length) {
    lines.push('', '**Where to eat**');
    for (const f of food) lines.push(`• *${name(f)}*${opensAt(f) ? ` · ${opensAt(f)}` : ''}`);
  }

  // ── Air and space ──
  const out = input.outdoors.sort((a, b) => prominence(b) - prominence(a)).slice(0, 3);
  if (out.length) {
    lines.push('', '**Green space & views**');
    for (const o of out) lines.push(`• *${name(o)}*`);
  }

  // ── Crowds ──
  if (sights.length) {
    lines.push('', '**Avoiding the crowds**');
    for (const a of crowdAdvice(input.sights)) lines.push(`• ${a}`);
  }

  lines.push('', `Open the Sightseeing tab with ${city} selected for the full list, and I'll keep watching for new events there. 🔔`);
  return lines.join('\n');
}
