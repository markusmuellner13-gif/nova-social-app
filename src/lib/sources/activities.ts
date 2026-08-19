// ─────────────────────────────────────────────────────────────────────────────
// Things to DO in a city — the data behind the "Far Far Away" tab.
//
// The shape of the problem is different from the local feed. The local feed
// answers "what is happening around me right now"; this answers "I am going to
// Lisbon in October, what is worth doing" — which means places as well as
// dates, and above all A WAY TO ACTUALLY GO.
//
// Nova does not sell tickets and does not want to. What it owes the user is the
// honest last mile: the real page where the operator sells the ticket. So the
// centre of gravity here is `findTicketLink` — read the attraction's OWN site
// and find its booking page. If we can't find one, we say "check the website"
// and link the site. We never invent a booking URL, never link a marketplace
// search we can't verify, and never imply a price we didn't read.
// ─────────────────────────────────────────────────────────────────────────────

import type { ApiPost } from './shared';
import { haversineKm } from './shared';
import { fetchAndRead, readPage } from '@/lib/brain/extractor';
import type { ExtractedRecord } from '@/lib/brain/extractor';
import { cacheGet, cacheSet } from '@/lib/serverCache';

/** What kind of thing this is, from the traveller's point of view. */
export type ActivityKind = 'museum' | 'sightseeing' | 'activity' | 'tour' | 'event';

export interface ActivityPost extends ApiPost {
  activityKind: ActivityKind;
  /** Where the operator actually sells it. Absent = we genuinely didn't find one. */
  ticketUrl?: string;
  /**
   * The subject's OWN site, when the post itself only carried an encyclopedia
   * or directory link. Better to send someone to the museum's website than to
   * its Wikipedia article when they are trying to visit it.
   */
  officialUrl?: string;
  /** The host we'd be sending the user to, for the "you'll book on X" label. */
  ticketHost?: string;
  openingHours?: string;
  duration?: string;
  rating?: number;
}

// ── Ticket link discovery ────────────────────────────────────────────────────

/**
 * STRONG signals: this link sells admission. In the languages Nova serves.
 *
 * The distinction from WEAK below is the difference between a card that says
 * "Get tickets" and one that says "Visit website", so it has to be real. A page
 * called "Entry information" describes the price; it does not sell you a ticket,
 * and promising otherwise is the kind of small lie that costs trust.
 *
 * Matched against BOTH href and anchor text, because plenty of sites link
 * `/shop` with the word "Tickets" and plenty do the exact opposite.
 */
const STRONG_TICKET_WORDS = /(tickets?|booking|\bbook\b|eintritt|karten|kasse|vorverkauf|billet|billetterie|biglietti|prenota|entradas|reserva|reserv(?:e|ation)|boletos|ingressos|kaartjes|bilet|チケット|予約|门票)/i;

/** WEAK signals: might be a purchase route, might be a page about one. */
const WEAK_TICKET_WORDS = /(buy|purchase|shop|admission|entry|besuch|visit)/i;

/** Anything worth looking at at all. */
const TICKET_WORDS = new RegExp(`${STRONG_TICKET_WORDS.source}|${WEAK_TICKET_WORDS.source}`, 'i');

/**
 * Hosts that exist to sell ADMISSION — a link to one of these is unambiguous.
 *
 * Note what is deliberately NOT here: `shop.`, `store.`, `webshop.`. A museum's
 * shop subdomain sells books and tote bags, and treating it as a ticket host
 * made a KHM exhibition catalogue outrank the actual admission page. A generic
 * shop has to earn it through the path or link text like anything else.
 */
const TICKET_HOSTS = [
  'eventbrite.', 'ticketmaster.', 'tickets.', 'ticketshop.', 'seetickets.',
  'dice.fm', 'universe.com', 'oeticket.com', 'ntry.at', 'wien-ticket.at',
  'billetweb.fr', 'fnacspectacles.com', 'ticketone.it', 'vivaticket.com',
  'entradas.com', 'ticketea.com', 'bilhetes.', 'eventim.', 'ticketswap.',
  'museumtickets.', 'tiqets.com', 'getyourguide.', 'viator.com', 'klook.com',
];

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; }
}

function isTicketHost(url: string): boolean {
  const h = hostOf(url);
  return TICKET_HOSTS.some(t => h.includes(t));
}

/** Junk that matches TICKET_WORDS but isn't a way to buy anything. */
const NOT_A_TICKET = /(gift|voucher|newsletter|membership|donate|donation|spenden|shop\/?merch|cart|basket|warenkorb|faq|terms|agb|privacy|datenschutz|impressum|contact|jobs|press)/i;

/**
 * Merchandise, not admission. A shop's product pages match "shop" and often
 * "book" (as in a book you buy), which is enough to look like a booking route
 * without this.
 */
const PRODUCT_PAGE = /(\/products?\/|\/artikel\/|\/merch|\/katalog|\/catalogue|\/p\/\d|isbn)/i;

/**
 * Find where this page's operator sells entry.
 *
 * Ranked, because a page has many candidates and the wrong one is worse than
 * none: an explicit ticketing host beats a same-site /tickets path, which beats
 * a link that merely says "tickets" somewhere in its text.
 */
export function findTicketLink(html: string, baseUrl: string): string | undefined {
  if (!html) return undefined;
  const seen = new Set<string>();
  const scored: { url: string; score: number }[] = [];

  const anchorRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = anchorRe.exec(html)) !== null && guard++ < 600) {
    const rawHref = m[1].trim();
    const text = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!rawHref || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) continue;

    let url: string;
    try { url = new URL(rawHref, baseUrl).toString(); } catch { continue; }
    if (!/^https?:/i.test(url) || seen.has(url)) continue;
    seen.add(url);

    const haystack = `${url} ${text}`;
    if (NOT_A_TICKET.test(haystack)) continue;
    if (PRODUCT_PAGE.test(url)) continue;
    if (!TICKET_WORDS.test(haystack)) continue;

    // A bare homepage is not a booking link even on a ticketing domain — it
    // leaves the user to search the site themselves, which is exactly the work
    // this is supposed to have done for them.
    const path = new URL(url).pathname.replace(/\/+$/, '');
    if (path === '') continue;

    // A weak word on its own is not enough to call something a ticket link.
    // Without this, "Entry information" beat the actual admission page — and
    // then the card offered "Get tickets" to a page that sells nothing.
    if (!isTicketHost(url) && !STRONG_TICKET_WORDS.test(`${path} ${text}`)) continue;

    let score = 0;
    // The host is the strongest signal available: a link to a ticketing domain
    // is unambiguous, while a word match can be a page merely ABOUT admission.
    if (isTicketHost(url)) score += 6;
    if (STRONG_TICKET_WORDS.test(path)) score += 4;
    if (STRONG_TICKET_WORDS.test(text)) score += 2;
    if (WEAK_TICKET_WORDS.test(path)) score += 1;
    if (score > 0) scored.push({ url, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.url;
}

/**
 * Pages that are one step away from the ticket desk.
 *
 * Measured on real museum sites: the landing page very often has no "Tickets"
 * link at all — the Mozarthaus links "Plan your Visit", and the booking route
 * lives one level in. Matching only the landing page therefore found a booking
 * link for a small minority of places, while the information was right there.
 */
const VISIT_WORDS = /(plan-?your-?visit|visit|besuch|besuche|planen|opening|hours|oeffnungszeiten|öffnungszeiten|preise|prices|tarif|tarife|admission|eintritt|informationen|information|besucher|visitor|horarios|orari|horaires|visita|bezoek)/i;

/** The most promising same-site page to look at next, if any. */
export function findVisitPage(html: string, baseUrl: string): string | undefined {
  let best: { url: string; score: number } | undefined;
  const anchorRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  let guard = 0;
  const baseHost = hostOf(baseUrl);

  while ((m = anchorRe.exec(html)) !== null && guard++ < 400) {
    let url: string;
    try { url = new URL(m[1].trim(), baseUrl).toString(); } catch { continue; }
    if (!/^https?:/i.test(url) || hostOf(url) !== baseHost) continue;   // one site only
    const path = new URL(url).pathname.replace(/\/+$/, '');
    if (path === '' || url === baseUrl) continue;
    const text = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (NOT_A_TICKET.test(`${url} ${text}`)) continue;

    let score = 0;
    if (VISIT_WORDS.test(path)) score += 2;
    if (VISIT_WORDS.test(text)) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { url, score };
  }
  return best?.url;
}

// ── Classification ───────────────────────────────────────────────────────────

const MUSEUM_RE = /\b(museum|museo|musée|musee|muzeum|múzeum|gallery|galerie|galleria|galería|kunsthalle|pinakothek|collection|sammlung|ausstellung|exhibition|exposition)\b/i;
const TOUR_RE = /\b(tour|tours|guided|führung|fuehrung|visite|visita|walking tour|boat trip|cruise|excursion|ausflug|safari|workshop|tasting|verkostung|class|kurs)\b/i;
const ACTIVITY_RE = /\b(park|zoo|aquarium|thermal|spa|climbing|kayak|bike|cycling|escape room|karting|skiing|diving|surf|adventure|experience|erlebnis)\b/i;

/** What is this, for the tab's filter chips? Dated things are always events. */
export function classifyActivity(post: ApiPost, record?: ExtractedRecord): ActivityKind {
  const text = `${post.title ?? ''} ${post.caption?.split('\n')[0] ?? ''} ${post.eventVenue ?? ''}`;
  if (record?.kind === 'tour') return 'tour';
  if (MUSEUM_RE.test(text)) return 'museum';
  if (TOUR_RE.test(text)) return 'tour';
  if (post.eventDateRaw) return 'event';
  if (ACTIVITY_RE.test(text)) return 'activity';
  if (post.category === 'sightseeing' || post.category === 'travel') return 'sightseeing';
  return 'activity';
}

// ── Enrichment ───────────────────────────────────────────────────────────────

/** Merge what the engine read off a page into the post, without overwriting truth. */
function applyRecord(post: ActivityPost, rec: ExtractedRecord | undefined, ticketUrl?: string): void {
  if (ticketUrl) { post.ticketUrl = ticketUrl; post.ticketHost = hostOf(ticketUrl); }
  if (!rec) return;
  // A price we READ replaces the "See website" placeholder, never a real one.
  if (rec.price && (!post.price || /see website/i.test(post.price))) post.price = rec.price;
  if (rec.openingHours && !post.openingHours) post.openingHours = rec.openingHours;
  if (rec.duration && !post.duration) post.duration = rec.duration;
  if (typeof rec.rating === 'number' && !post.rating) post.rating = rec.rating;
  if (rec.ticketUrl && !post.ticketUrl) {
    post.ticketUrl = rec.ticketUrl;
    post.ticketHost = hostOf(rec.ticketUrl);
  }
  // Only take a photo when the post has none — realImage.ts owns photo policy
  // and a photo from the subject's OWN page is attributable to the subject.
  if (rec.image && !post.image) post.image = rec.image;
}

const ENRICH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; NovaBot/1.0; +https://nova-app.com)',
  'Accept': 'text/html,application/xhtml+xml',
};

// ── From an encyclopedia article to the operator's own site ──────────────────
//
// Most sightseeing content reaches us from Wikipedia, whose URL is an article
// ABOUT the landmark — there is no ticket desk on it, and its own links belong
// to the encyclopedia. Without this step the tab knows the Kunsthistorisches
// Museum exists but cannot tell you where to buy a ticket, which is the one
// thing it is for.
//
// Wikidata holds exactly that: property P856, "official website", reachable in
// ONE keyless call by article title. Cached for a week because a landmark's
// official domain effectively never changes.

const WIKIDATA_HEADERS = { 'User-Agent': 'NovaBot/1.0 (+https://nova-app.com)', 'Accept': 'application/json' };

/** "https://en.wikipedia.org/wiki/Mozarthaus_Vienna" → "Mozarthaus Vienna". */
export function wikipediaTitleFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('wikipedia.org')) return null;
    const m = u.pathname.match(/^\/wiki\/(.+)$/);
    if (!m) return null;
    const title = decodeURIComponent(m[1]).replace(/_/g, ' ').trim();
    return title && !title.includes(':') ? title : null;   // skip File:/Category: pages
  } catch { return null; }
}

interface WikidataClaims {
  entities?: Record<string, { claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]> }>;
}

/** The subject's own website, or null. Never guesses a domain from the name. */
export async function officialSiteForWikipediaTitle(
  title: string, opts: { lang?: string; timeoutMs?: number } = {},
): Promise<string | null> {
  const { lang = 'en', timeoutMs = 4500 } = opts;
  const cacheKey = `nova:wikidata:site:${lang}:${title.toLowerCase().slice(0, 80)}`;
  const cached = await cacheGet<{ url: string | null }>(cacheKey).catch(() => null);
  if (cached) return cached.url;

  let found: string | null = null;
  try {
    const api = 'https://www.wikidata.org/w/api.php?action=wbgetentities'
      + `&sites=${lang}wiki&titles=${encodeURIComponent(title)}`
      + '&props=claims&format=json&origin=*';
    const res = await fetch(api, { headers: WIKIDATA_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) {
      const data = await res.json() as WikidataClaims;
      const entity = Object.values(data.entities ?? {})[0];
      for (const claim of entity?.claims?.P856 ?? []) {
        const value = claim.mainsnak?.datavalue?.value;
        if (typeof value === 'string' && /^https?:\/\//i.test(value)) { found = value; break; }
      }
    }
  } catch { /* no official site on record, or Wikidata unreachable */ }

  // Cache the negative too — most articles genuinely have no P856, and we do
  // not want to re-ask for every one of them on every request.
  await cacheSet(cacheKey, { url: found }, 7 * 24 * 3600).catch(() => { /* optional */ });
  return found;
}

/**
 * Read each post's own page for a ticket link and the facts a traveller needs.
 *
 * Bounded on every axis — batch width, per-request timeout and a wall-clock
 * budget — because this runs inside a request. Anything not enriched in time is
 * returned exactly as it came in, which is a slightly thinner card, not a
 * failure.
 */
export async function enrichWithTickets(
  posts: ActivityPost[], opts: { budgetMs?: number; batch?: number; timeoutMs?: number } = {},
): Promise<ActivityPost[]> {
  const { budgetMs = 6000, batch = 6, timeoutMs = 3500 } = opts;

  // Work out, per post, WHICH page is worth reading. A directory page about the
  // place (OSM, Wikipedia) is not it — but a Wikipedia article can point us at
  // the operator's own site via Wikidata, and that page is exactly it.
  const candidates = posts.filter(p => p.ticketUrl == null && p.eventUrl && /^https?:\/\//i.test(p.eventUrl));
  const targets: { post: ActivityPost; url: string }[] = [];

  await Promise.all(candidates.map(async post => {
    const url = post.eventUrl!;
    const h = hostOf(url);
    if (h.includes('wikipedia.org')) {
      const title = wikipediaTitleFromUrl(url);
      const official = title ? await officialSiteForWikipediaTitle(title) : null;
      if (official) { post.officialUrl = official; targets.push({ post, url: official }); }
      return;
    }
    if (h.includes('openstreetmap.org') || h.includes('wikidata.org')) return;
    targets.push({ post, url });
  }));

  // The budget starts HERE, not at entry. Resolving official sites above costs
  // a couple of seconds of its own, and charging that to the reading budget
  // meant the loop below could be over before it read a single page — which is
  // exactly what happened: official sites resolved, ticket links never found.
  const deadline = Date.now() + budgetMs;

  for (let i = 0; i < targets.length; i += batch) {
    if (Date.now() > deadline) break;
    await Promise.all(targets.slice(i, i + batch).map(async ({ post, url }) => {
      try {
        const res = await fetch(url, { headers: ENRICH_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) return;
        const html = (await res.text()).slice(0, 600_000);
        let ticket = findTicketLink(html, url);
        // Same page, so read it with the engine too — this is also where the
        // engine meets (and learns) the long tail of museum/operator sites.
        const { records } = await readPage(html, { url, kind: 'attraction' });

        // One hop deeper, and only when the landing page had no booking route:
        // the "Plan your visit" page is where most museums actually keep it.
        if (!ticket && Date.now() < deadline) {
          const visitPage = findVisitPage(html, url);
          if (visitPage) {
            try {
              const res2 = await fetch(visitPage, { headers: ENRICH_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
              if (res2.ok) {
                const html2 = (await res2.text()).slice(0, 600_000);
                ticket = findTicketLink(html2, visitPage);
                // Opening hours and prices usually live on this page too.
                const deeper = await readPage(html2, { url: visitPage, kind: 'attraction' });
                if (deeper.records[0]) applyRecord(post, deeper.records[0]);
              }
            } catch { /* the landing page is still a good answer */ }
          }
        }

        applyRecord(post, records[0], ticket);
      } catch { /* leave the post as it is */ }
    }));
  }
  return posts;
}

// ── Composition ──────────────────────────────────────────────────────────────

const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface ActivityQuery {
  city: string;
  country: string;
  lat: number;
  lng: number;
  /** Inclusive date window for dated things. Undated places always qualify. */
  from?: string;
  to?: string;
  kinds?: ActivityKind[];
  count?: number;
  page?: number;
}

/** Pull one category from our own feed API — the same content the app shows. */
async function fromFeed(origin: string, q: ActivityQuery, category: string, count: number): Promise<ApiPost[]> {
  const params = new URLSearchParams({
    category,
    city: q.city,
    country: q.country,
    lat: q.lat.toFixed(4),
    lng: q.lng.toFixed(4),
    count: String(count),
    page: String(q.page ?? 0),
    radius: '30',
    days: '120',
    // The user is planning a trip, so rank by what is notable, not what is near
    // the phone — this is the same flag the trip planner uses.
    visiting: '1',
  });
  try {
    const res = await fetch(`${origin}/api/feed?${params}`, { signal: AbortSignal.timeout(24_000) });
    if (!res.ok) return [];
    const data = await res.json() as { posts?: ApiPost[] };
    return data.posts ?? [];
  } catch { return []; }
}

function inWindow(post: ApiPost, from?: string, to?: string): boolean {
  if (!post.eventDateRaw) return true;        // a museum is on every day
  if (from && post.eventDateRaw < from) return false;
  if (to && post.eventDateRaw > to) return false;
  return true;
}

/**
 * Everything worth doing in one city, ready for the tab.
 *
 * Sightseeing and events are fetched in parallel because they answer different
 * halves of the question and neither should wait for the other.
 */
export async function fetchCityActivities(
  origin: string, q: ActivityQuery,
): Promise<ActivityPost[]> {
  const count = Math.max(4, Math.min(30, q.count ?? 18));

  const [places, events] = await Promise.all([
    fromFeed(origin, q, 'sightseeing', count),
    fromFeed(origin, q, 'events', count),
  ]);

  const seen = new Set<string>();
  const merged: ActivityPost[] = [];
  for (const post of [...places, ...events]) {
    const key = (post.title ?? post.caption?.split('\n')[0] ?? post.id)
      .toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 44);
    if (!key || seen.has(key)) continue;
    if (!inWindow(post, q.from, q.to)) continue;
    seen.add(key);
    merged.push({ ...post, activityKind: classifyActivity(post) });
  }

  const wanted = q.kinds?.length ? merged.filter(p => q.kinds!.includes(p.activityKind)) : merged;

  // Enrich the page the user will actually see, not the whole pool.
  const head = wanted.slice(0, count);
  await enrichWithTickets(head);

  return rankActivities(head, q);
}

/**
 * Order for a visitor: things happening inside the window first (they expire),
 * then places, with a real photo and a real ticket link both counting for
 * something because they are what make a card actionable.
 */
export function rankActivities(posts: ActivityPost[], q: ActivityQuery): ActivityPost[] {
  const today = iso(new Date());
  return [...posts].sort((a, b) => score(b) - score(a));

  function score(p: ActivityPost): number {
    let s = 0;
    if (p.eventDateRaw && p.eventDateRaw >= today) {
      // Sooner is more urgent, but only within the window we were asked about.
      const days = Math.max(0, (new Date(p.eventDateRaw).getTime() - Date.now()) / 86_400_000);
      s += 3 - Math.min(2.5, days / 30);
    }
    if (p.image) s += 1.5;
    if (p.ticketUrl) s += 1.5;
    if (p.activityKind === 'museum' || p.activityKind === 'sightseeing') s += 0.5;
    if (typeof p.rating === 'number') s += Math.min(1, p.rating / 5);
    if (p.location && (q.lat || q.lng)) {
      const d = haversineKm(q.lat, q.lng, p.location.lat, p.location.lng);
      if (Number.isFinite(d)) s += Math.max(0, 1 - d / 30);
    }
    return s;
  }
}

/** Read one operator's page directly — used when a card is opened. */
export async function readOperatorPage(url: string): Promise<{
  record?: ExtractedRecord; ticketUrl?: string;
}> {
  const { records } = await fetchAndRead(url, { kind: 'attraction', timeoutMs: 5000 });
  return { record: records[0] };
}
