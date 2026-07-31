// The assistant's data layer.
//
// Two things were wrong with the chatbot, and both are fixed here.
//
// 1. It only worked in Vienna. It answered exclusively from our own events DB,
//    so any city we hadn't ingested got "I'm having trouble connecting right
//    now" — which wasn't even true: nothing was failing, we just had no rows.
//    It now falls back to the app's own live feed, which is the same machinery
//    the Discover tab uses, so the assistant works anywhere the app works.
//
// 2. It couldn't plan a trip. Asking "what should I see in Rome in three weeks"
//    was treated as "what's on near me". Now a destination and a future window
//    are understood, the data for that city is gathered, and a structured
//    briefing comes back.
//
// Everything the assistant says is grounded in rows we actually hold. When we
// have nothing, it says we have nothing.

import type { ApiPost } from '@/lib/sources/shared';
import { haversineKm } from '@/lib/sources/shared';
import { dbReadEnabled, queryEventsNearAny } from '@/lib/eventsDb';
import { cacheGet, cacheSet } from '@/lib/serverCache';
import { buildTripBriefing, parseTripQuery, type TripQuery } from './trip';

export interface GeoPoint { lat: number; lng: number; city: string; country: string }

// ─────────────────────────────────────────────────────────────────────────────
// Destination memory
// ─────────────────────────────────────────────────────────────────────────────
// Every city someone asks a trip question about is remembered, with a hit count.
// The brain's background pass then pre-builds the most-asked-about places, so a
// destination that was slow for the first person is instant for the next — and
// the app's coverage grows toward where its users are actually going, rather
// than toward a list of cities somebody hard-coded a year ago.

const DEST_KEY = 'nova:brain:destinations';
const DEST_TTL = 60 * 60 * 24 * 90;

interface DestinationRecord { city: string; country: string; lat: number; lng: number; hits: number; last: number }

export async function rememberDestination(geo: GeoPoint): Promise<void> {
  if (!geo.city) return;
  try {
    const all = (await cacheGet<Record<string, DestinationRecord>>(DEST_KEY)) ?? {};
    const key = geo.city.toLowerCase();
    const prev = all[key];
    all[key] = {
      city: geo.city, country: geo.country, lat: geo.lat, lng: geo.lng,
      hits: (prev?.hits ?? 0) + 1, last: Date.now(),
    };
    // Keep the list bounded: the 200 most-asked-about places.
    const trimmed = Object.entries(all)
      .sort((a, b) => b[1].hits - a[1].hits || b[1].last - a[1].last)
      .slice(0, 200);
    await cacheSet(DEST_KEY, Object.fromEntries(trimmed), DEST_TTL);
  } catch { /* no Redis — the feature simply doesn't accumulate */ }
}

/** Destinations worth pre-building, most-requested first. */
export async function topDestinations(limit = 8): Promise<DestinationRecord[]> {
  try {
    const all = (await cacheGet<Record<string, DestinationRecord>>(DEST_KEY)) ?? {};
    return Object.values(all)
      .sort((a, b) => b.hits - a.hits || b.last - a.last)
      .slice(0, limit);
  } catch { return []; }
}

/** Resolve a place name the user typed to coordinates, via our geocode proxy. */
export async function resolveDestination(origin: string, place: string): Promise<GeoPoint | null> {
  try {
    const res = await fetch(`${origin}/api/geocode?q=${encodeURIComponent(place)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { results?: { city: string; country: string; lat: number; lng: number }[] };
    const hit = data.results?.[0];
    if (!hit || !Number.isFinite(hit.lat)) return null;
    return { lat: hit.lat, lng: hit.lng, city: hit.city, country: hit.country };
  } catch { return null; }
}

/**
 * Pull a category's posts for a place — our DB first (instant), the live feed
 * second (slower, but works for a city nobody has visited yet). The live call
 * also write-throughs to the DB, so asking about a new city makes the app better
 * at that city for everyone afterwards.
 */
export async function gather(
  origin: string, geo: GeoPoint, category: string, count = 12, opts: { visiting?: boolean; days?: number } = {}
): Promise<ApiPost[]> {
  const params = new URLSearchParams({
    category,
    city: geo.city,
    country: geo.country,
    lat: geo.lat.toFixed(3),
    lng: geo.lng.toFixed(3),
    count: String(count),
    page: '0',
    radius: '25',
    days: String(opts.days ?? 60),
  });
  if (opts.visiting) params.set('visiting', '1');
  try {
    const res = await fetch(`${origin}/api/feed?${params}`, { signal: AbortSignal.timeout(26_000) });
    if (!res.ok) return [];
    const data = await res.json() as { posts?: ApiPost[] };
    return data.posts ?? [];
  } catch { return []; }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Answer a trip question. Returns null when the message isn't one, so the caller
 * can fall through to the normal "what's on near me" path.
 */
export async function answerTrip(
  message: string, origin: string, fallback?: { lat: number; lng: number; city: string; country: string }
): Promise<{ reply: string; city: string } | null> {
  const q: TripQuery = parseTripQuery(message);
  if (!q.isTrip || !q.destination) return null;

  const geo = await resolveDestination(origin, q.destination)
    ?? (fallback && q.destination.toLowerCase() === fallback.city.toLowerCase() ? fallback : null);
  if (!geo) return null;

  // Remember it, so the brain's background pass keeps this city warm from now on.
  void rememberDestination(geo).catch(() => {});

  const start = new Date();
  start.setDate(start.getDate() + (q.inDays ?? 0));
  const end = new Date(start);
  end.setDate(end.getDate() + q.spanDays);
  // Ask the event sources for a window that actually reaches the trip.
  const days = Math.min(180, Math.max(30, (q.inDays ?? 0) + q.spanDays + 7));

  // Gather in parallel — the whole briefing should take one round trip, not four.
  const [sights, events, food, outdoors] = await Promise.all([
    gather(origin, geo, 'sightseeing', 14, { visiting: true }),
    gather(origin, geo, 'events', 16, { visiting: true, days }),
    gather(origin, geo, 'restaurants', 10, { visiting: true }),
    gather(origin, geo, 'outdoors', 8, { visiting: true }),
  ]);

  // Nothing at all for this place — say so plainly rather than inventing a
  // guidebook out of thin air.
  if (sights.length === 0 && events.length === 0 && food.length === 0) {
    return {
      city: geo.city,
      reply: `I don't have listings for **${geo.city}** yet — I only ever answer from real, verified data, so I'd rather tell you that than make something up.\n\nI've started building ${geo.city} in the background just now, so ask me again in a few minutes and I should have something. In the meantime you can switch the app's city to ${geo.city} from the location button and browse what comes in live. 🌍`,
    };
  }

  const withDist = (posts: ApiPost[]) => posts.map(p => {
    const la = p.location?.lat, ln = p.location?.lng;
    const d = typeof la === 'number' && typeof ln === 'number' ? haversineKm(geo.lat, geo.lng, la, ln) : undefined;
    return { ...p, distanceKm: d };
  });

  return {
    city: geo.city,
    reply: buildTripBriefing({
      city: geo.city,
      whenLabel: q.whenLabel,
      from: iso(start),
      to: iso(end),
      sights: withDist(sights).filter(p => !p.isEvent),
      events: events.filter(p => p.isEvent),
      food: withDist(food),
      outdoors: withDist(outdoors),
    }),
  };
}

/**
 * Last-resort answer for a normal question in a city our DB doesn't cover:
 * fetch it live and answer from that. This is what stops the assistant from
 * being a Vienna-only feature.
 */
export async function answerFromLive(
  origin: string, geo: GeoPoint, categories: string[], windowLabel: string
): Promise<ApiPost[]> {
  const cats = categories.slice(0, 3);
  const results = await Promise.all(cats.map(c => gather(origin, geo, c, 10)));
  const merged: ApiPost[] = [];
  const seen = new Set<string>();
  for (const list of results) {
    for (const p of list) {
      const k = (p.caption?.split('\n')[0] ?? p.id).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 36);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(p);
    }
  }
  void windowLabel;
  return merged;
}

/** Is our own DB likely to know anything about this point? */
export async function dbHasCoverage(lat: number, lng: number): Promise<boolean> {
  if (!dbReadEnabled) return false;
  try {
    const rows = await queryEventsNearAny({
      lat, lng, radiusKm: 40, categories: ['events', 'music', 'sightseeing', 'restaurants'],
      afterIso: new Date().toISOString(), limit: 3, offset: 0,
    });
    return rows.length >= 2;
  } catch { return false; }
}
