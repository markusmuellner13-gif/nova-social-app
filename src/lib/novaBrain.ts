// ─────────────────────────────────────────────────────────────────────────────
// Nova Brain — the app's OWN chatbot intelligence. FREE, no LLM credits.
//
// Instead of paying an LLM to answer every "what's on in <city> this weekend?",
// this parses the question with deterministic NLP (category + time + price
// intent) and answers from our OWN events database (the same real rows that
// power the feed). It reads the user's intent, queries Postgres, and writes back
// a friendly, accurate, source-linked reply.
//
// /api/chat uses this first. It only falls back to the (optional, paid) LLM when
// the brain genuinely has nothing to say AND a key is configured.
// ─────────────────────────────────────────────────────────────────────────────

import type { ApiPost } from '@/lib/sources/shared';
import { haversineKm } from '@/lib/sources/shared';
import { queryEventsNearAny } from '@/lib/eventsDb';

// A result farther than this from the user is a "nearby town", not the user's
// own city. Keeps a Baden query from being answered with Vienna events as if
// they were local — and stops two neighbouring cities returning the same list.
const LOCAL_RADIUS_KM = 20;

// ── Intent parsing ────────────────────────────────────────────────────────────

// Keyword → app category. Order matters only for readability; all are scanned.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  music:       ['music', 'concert', 'concerts', 'gig', 'gigs', 'live music', 'band', 'bands', 'dj', 'club', 'clubbing', 'nightlife', 'rave', 'festival', 'jazz', 'techno', 'rock', 'pop'],
  sports:      ['sport', 'sports', 'match', 'matches', 'game', 'football', 'soccer', 'basketball', 'tennis', 'run', 'marathon', 'cycling'],
  art:         ['art', 'gallery', 'galleries', 'exhibition', 'exhibitions', 'museum', 'museums', 'expo', 'painting', 'photography'],
  food:        ['food', 'restaurant', 'restaurants', 'eat', 'dining', 'dinner', 'lunch', 'brunch', 'foodie', 'street food', 'wine', 'tasting', 'market', 'markets'],
  restaurants: ['restaurant', 'restaurants', 'bar', 'bars', 'rooftop', 'cafe', 'cafes', 'coffee'],
  fitness:     ['fitness', 'gym', 'yoga', 'workout', 'hiking', 'wellness', 'pilates'],
  tech:        ['tech', 'technology', 'startup', 'startups', 'hackathon', 'coding', 'developer', 'meetup'],
  community:   ['community', 'meetup', 'meetups', 'volunteer', 'social', 'networking'],
  fashion:     ['fashion', 'vintage', 'thrift', 'shopping', 'boutique', 'designer'],
  sightseeing: ['sightseeing', 'landmark', 'landmarks', 'tour', 'tours', 'sights', 'monument', 'historic', 'attraction', 'attractions'],
  hotels:      ['hotel', 'hotels', 'stay', 'accommodation', 'spa'],
  events:      ['event', 'events', 'happening', 'things to do', 'whats on', "what's on", 'going on', 'anything to do'],
};

const APP_CATEGORIES = ['events', 'music', 'sports', 'art', 'food', 'restaurants', 'fitness', 'tech', 'community', 'fashion', 'sightseeing', 'hotels'];

export interface Intent {
  categories: string[];
  window: 'today' | 'tonight' | 'tomorrow' | 'weekend' | 'week' | 'month' | 'any';
  freeOnly: boolean;
  offTopic: boolean;
}

const OFF_TOPIC = ['code', 'coding', 'python', 'javascript', 'homework', 'essay', 'medical', 'doctor', 'politics', 'stock', 'crypto', 'recipe', 'translate', 'math', 'weather forecast'];

export function parseIntent(message: string): Intent {
  const m = ` ${message.toLowerCase()} `;

  const categories: string[] = [];
  for (const cat of APP_CATEGORIES) {
    const kws = CATEGORY_KEYWORDS[cat] ?? [];
    if (kws.some(k => m.includes(k))) categories.push(cat);
  }

  let window: Intent['window'] = 'any';
  if (/\btonight\b|\bthis evening\b/.test(m)) window = 'tonight';
  else if (/\btoday\b|\bright now\b|\bnow\b/.test(m)) window = 'today';
  else if (/\btomorrow\b/.test(m)) window = 'tomorrow';
  else if (/\bweekend\b|\bsaturday\b|\bsunday\b/.test(m)) window = 'weekend';
  else if (/\bthis week\b|\bweek\b/.test(m)) window = 'week';
  else if (/\bthis month\b|\bmonth\b/.test(m)) window = 'month';

  const freeOnly = /\bfree\b|\bno cost\b|\bcheap\b|\bbudget\b/.test(m);

  // Off-topic only if it clearly asks for something unrelated AND mentions no
  // location/event intent.
  const offTopic = OFF_TOPIC.some(k => m.includes(k)) && categories.length === 0;

  return { categories: categories.length ? categories : ['events', 'music', 'art', 'food', 'community'], window, freeOnly, offTopic };
}

// ── Time-window filtering ─────────────────────────────────────────────────────

function dateRange(window: Intent['window']): { from: string; to: string | null } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const plus = (days: number) => { const d = new Date(today); d.setDate(d.getDate() + days); return d; };

  switch (window) {
    case 'today':
    case 'tonight':   return { from: iso(today), to: iso(today) };
    case 'tomorrow':  return { from: iso(plus(1)), to: iso(plus(1)) };
    case 'weekend': {
      // Upcoming Sat–Sun
      const dow = today.getDay();           // 0 Sun … 6 Sat
      const toSat = (6 - dow + 7) % 7;
      const sat = plus(dow === 0 ? -1 : toSat); // if Sunday, "this weekend" includes today
      const sun = plus(dow === 0 ? 0 : toSat + 1);
      return { from: iso(sat), to: iso(sun) };
    }
    case 'week':      return { from: iso(today), to: iso(plus(7)) };
    case 'month':     return { from: iso(today), to: iso(plus(31)) };
    default:          return { from: iso(today), to: null };
  }
}

function inWindow(p: ApiPost, range: { from: string; to: string | null }): boolean {
  const d = p.eventDateRaw;
  if (!d) return range.to === null; // undated → only for open-ended queries
  if (d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}

function isFree(p: ApiPost): boolean {
  const s = (p.price ?? '').toLowerCase();
  return s.includes('free') || s === '€ 0' || s === '0';
}

// ── Reply composition ─────────────────────────────────────────────────────────

function titleOf(p: ApiPost): string {
  const first = (p.caption || '').split('\n')[0].trim();
  if (first && !first.startsWith('📅')) return first.slice(0, 90);
  return p.organizer || p.eventVenue || 'Event';
}

function lineFor(p: ApiPost, showDistance = false): string {
  const bits = [`• *${titleOf(p)}*`];
  if (p.eventDate) bits.push(`📅 ${p.eventDate.replace(/ · /, ' · ')}`);
  const venue = p.eventVenue || p.location?.name;
  if (venue) {
    const dist = showDistance && typeof p.distanceKm === 'number' ? ` (~${Math.round(p.distanceKm)} km)` : '';
    bits.push(`📍 ${venue}${dist}`);
  }
  if (p.price && p.price !== 'See website') bits.push(`🎟️ ${p.price}`);
  if (p.eventUrl && p.eventUrl !== '#') bits.push(`🔗 ${p.eventUrl}`);
  return bits.join('\n   ');
}

const WINDOW_LABEL: Record<Intent['window'], string> = {
  today: 'today', tonight: 'tonight', tomorrow: 'tomorrow',
  weekend: 'this weekend', week: 'this week', month: 'this month', any: 'coming up',
};

export interface BrainResult { reply: string; used: boolean; count: number }

// Answer a user's question from our own events DB. `used` is false when the DB
// had nothing relevant — the caller can then fall back to an LLM if it wants.
export async function answerLocally(opts: {
  message: string; city?: string; country?: string; lat?: number; lng?: number;
}): Promise<BrainResult> {
  const intent = parseIntent(opts.message);
  const where = opts.city ? `in ${opts.city}` : 'near you';

  if (intent.offTopic) {
    return {
      used: true, count: 0,
      reply: "I'm Nova's event discovery AI — I can only help you find things to do and places to go. Try asking me about events in a city you love! 🌍",
    };
  }

  // Need coordinates to query the geo DB. Without them we can't answer locally.
  if (typeof opts.lat !== 'number' || typeof opts.lng !== 'number' || (opts.lat === 0 && opts.lng === 0)) {
    return { used: false, count: 0, reply: '' };
  }

  const range = dateRange(intent.window);
  let pool: ApiPost[] = [];
  try {
    pool = await queryEventsNearAny({
      lat: opts.lat, lng: opts.lng, radiusKm: 60,
      categories: intent.categories,
      afterIso: new Date(`${range.from}T00:00:00Z`).toISOString(),
      limit: 80, offset: 0,
    });
  } catch {
    return { used: false, count: 0, reply: '' };
  }

  // Stamp the true distance from THIS user (the stored distanceKm is relative to
  // the ingest centroid, so it can't be trusted for a different query point).
  const withDist = pool.map(p => {
    const lat = p.location?.lat, lng = p.location?.lng;
    const d = typeof lat === 'number' && typeof lng === 'number'
      ? haversineKm(opts.lat!, opts.lng!, lat, lng) : undefined;
    return { ...p, distanceKm: d };
  });

  // Filter to the requested window + price, dedupe by title, soonest first.
  const seen = new Set<string>();
  const matches = withDist
    .filter(p => inWindow(p, range))
    .filter(p => !intent.freeOnly || isFree(p))
    .filter(p => {
      const k = titleOf(p).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
      if (seen.has(k)) return false; seen.add(k); return true;
    })
    .sort((a, b) => (a.eventDateRaw ?? '9999') < (b.eventDateRaw ?? '9999') ? -1 : 1);

  // Split the user's OWN city from nearby towns by real distance, so two
  // neighbouring cities never return the same answer and Vienna events are never
  // passed off as Baden's.
  const local  = matches.filter(p => typeof p.distanceKm !== 'number' || p.distanceKm <= LOCAL_RADIUS_KM).slice(0, 6);
  const nearby = matches.filter(p => typeof p.distanceKm === 'number' && p.distanceKm > LOCAL_RADIUS_KM).slice(0, 6);

  const catLabel = intent.categories.length === 1 && intent.categories[0] !== 'events'
    ? intent.categories[0] : '';

  if (local.length > 0) {
    const header = `Here's what's ${WINDOW_LABEL[intent.window]} ${where}${catLabel ? ` for ${catLabel}` : ''}: ✨`;
    const body = local.map(p => lineFor(p)).join('\n\n');
    const footer = intent.freeOnly
      ? '\n\nAll free entry 🎉 Open the feed for even more.'
      : '\n\nOpen the Events tab for the full list and directions! 🧭';
    return { used: true, count: local.length, reply: `${header}\n\n${body}${footer}` };
  }

  if (nearby.length > 0) {
    // Honest: the user's own town is quiet, so we clearly say so and label the
    // nearby suggestions with their distance instead of pretending they're local.
    const cityName = opts.city ? opts.city : 'your area';
    const header = `${cityName} looks quiet ${WINDOW_LABEL[intent.window]}${catLabel ? ` for ${catLabel}` : ''} — here's what's on in nearby towns: 📍`;
    const body = nearby.map(p => lineFor(p, /* showDistance */ true)).join('\n\n');
    return { used: true, count: nearby.length, reply: `${header}\n\n${body}\n\nOpen the Events tab to explore more around you! 🧭` };
  }

  // Nothing in our DB for this slice — let the caller decide on a fallback.
  return { used: false, count: 0, reply: '' };
}
