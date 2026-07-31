// Prominence ranking — "what's worth seeing here", as opposed to "what's closest".
//
// OpenStreetMap results come back nearest-first, which is exactly right when you
// are standing in your own city and hungry. It is exactly wrong when you are
// planning a trip: asking Nova where to eat in Barcelona answered "McDonald's,
// then KFC", because there is a McDonald's near Plaça Catalunya. Technically
// correct, and useless.
//
// So when the user is NOT local to the place they're browsing, we rank by how
// much a place is worth going to rather than how near it is. Everything here is
// derived from real data on the post — no invented ratings, no made-up review
// scores.

import type { ApiPost } from '@/lib/sources/shared';
import { haversineKm } from '@/lib/sources/shared';

// International chains. Not a quality judgement — a McDonald's is a perfectly
// fine McDonald's — but nobody flies to Barcelona to find one, and a traveller
// asking "where should I eat" is not asking about them. They are demoted, not
// removed, so someone actively looking can still scroll to them.
const CHAINS = [
  "mcdonald's", 'mcdonalds', 'burger king', 'kfc', 'subway', 'starbucks',
  'domino', 'pizza hut', 'dunkin', 'costa coffee', 'five guys', 'taco bell',
  'wendy', 'popeyes', 'nordsee', 'vapiano', 'lidl', 'aldi', 'spar ',
  'carrefour', 'tesco', 'seven eleven', '7-eleven', 'circle k',
];

export function isChain(name: string): boolean {
  const n = (name ?? '').toLowerCase();
  return CHAINS.some(c => n.includes(c));
}

/**
 * How notable is this place, 0–1, from signals we actually have:
 * a Wikipedia/Wikidata article, its own website, a real photo, a description
 * someone wrote, and accumulated popularity.
 */
export function prominence(post: ApiPost): number {
  let s = 0;
  const title = post.caption?.split('\n')[0] ?? '';
  const name = post.organizer || post.user?.name || '';

  // A Wikipedia article is the strongest honest signal that a place matters.
  if (/wikipedia\.org|wikidata/i.test(post.eventUrl ?? '')) s += 0.4;
  else if (post.id?.startsWith('wiki_')) s += 0.4;

  // Its own website — a real business or institution, not just a map pin.
  if (post.eventUrl && !/openstreetmap\.org/i.test(post.eventUrl)) s += 0.15;

  // A genuine photo of the place rather than a stock stand-in.
  if (post.image && !/picsum\.photos|unsplash|pexels/i.test(post.image)) s += 0.2;

  // Someone wrote something about it.
  if ((post.caption?.length ?? 0) > 220) s += 0.1;
  if (title.length > 20) s += 0.05;

  s += Math.min(0.1, Math.log10((post.likes ?? 0) + 1) / 20);

  if (isChain(name) || isChain(title)) s -= 0.5;

  return Math.max(0, Math.min(1, s));
}

/** Is the user actually in the place they're looking at? */
export function isLocalToCity(
  user: { lat: number; lng: number } | null,
  cityCentre: { lat: number; lng: number } | null,
  withinKm = 60
): boolean {
  if (!user || !cityCentre) return true; // unknown → behave as before
  if (!user.lat && !user.lng) return true;
  const d = haversineKm(user.lat, user.lng, cityCentre.lat, cityCentre.lng);
  return Number.isFinite(d) && d <= withinKm;
}

/** Name to test for chain-ness: the venue, falling back to the headline. */
function displayName(p: ApiPost): string {
  return p.organizer || p.user?.name || (p.caption?.split('\n')[0] ?? '');
}

/**
 * Order places for a visitor.
 *
 * Chains are a HARD tier, not a scoring penalty. That distinction matters: in
 * production every Barcelona restaurant scored within 0.05 of every other
 * (they all had stock photos and only an OpenStreetMap link), so a penalty that
 * merely lowered the score was swallowed by the tie-breaker and McDonald's and
 * KFC came back to the top on distance alone. A traveller asking where to eat in
 * Barcelona should never be handed a McDonald's above an independent, whatever
 * the other signals say — so chains sort last, full stop.
 *
 * Within a tier: more notable first, distance breaking near-ties so a famous
 * place across town still beats an unremarkable one next door.
 */
export function rankForVisitor(posts: ApiPost[]): ApiPost[] {
  return [...posts].sort((a, b) => {
    const ca = isChain(displayName(a)) ? 1 : 0;
    const cb = isChain(displayName(b)) ? 1 : 0;
    if (ca !== cb) return ca - cb;

    const pa = prominence(a), pb = prominence(b);
    if (Math.abs(pa - pb) > 0.02) return pb - pa;
    return (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999);
  });
}
