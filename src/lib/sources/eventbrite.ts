// Eventbrite public city pages — FREE real events via schema.org JSON-LD.
// No API key, no AI credits — reads the structured data embedded in the page.
// Supports per-category pages and deep pagination (?page=N) so every category
// has a real, endless stream.

import { ApiPost, makeUser, slugify, todayStr } from './shared';

// Eventbrite's JSON-LD has no geo coordinates, so every event would otherwise be
// stamped with the SEARCH-CITY centroid. On a small town's page Eventbrite spills
// in big-city events (Baden's page lists Vienna events) — which then get stamped
// AT the small town and pollute its feed. We can't geocode each venue cheaply, so
// instead we drop events whose venue city is a *recognised different major city*
// than the one searched. Unknown/suburb localities are kept (assumed local).
const CITY_ALIASES: Record<string, string> = {
  wien: 'vienna', vienna: 'vienna', muenchen: 'munich', munchen: 'munich', munich: 'munich',
  koeln: 'cologne', koln: 'cologne', cologne: 'cologne', praha: 'prague', prague: 'prague',
  roma: 'rome', rome: 'rome', firenze: 'florence', florence: 'florence', venezia: 'venice',
  venice: 'venice', napoli: 'naples', naples: 'naples', milano: 'milan', milan: 'milan',
  torino: 'turin', turin: 'turin', wenen: 'vienna', graz: 'graz', linz: 'linz',
  salzburg: 'salzburg', innsbruck: 'innsbruck', berlin: 'berlin', hamburg: 'hamburg',
  frankfurt: 'frankfurt', zurich: 'zurich', zuerich: 'zurich', london: 'london',
  paris: 'paris', barcelona: 'barcelona', madrid: 'madrid', amsterdam: 'amsterdam',
  budapest: 'budapest', lisbon: 'lisbon', lisboa: 'lisbon', dublin: 'dublin',
};

function normCity(s: string): string {
  const n = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  return CITY_ALIASES[n] ?? n;
}

// True when the venue city is a recognised major city different from the search
// city (→ drop it). Unknown localities return false (→ keep).
function isDifferentMajorCity(venueCity: string, searchCity: string): boolean {
  const v = normCity(venueCity);
  if (!v || !(v in CITY_ALIASES) && !Object.values(CITY_ALIASES).includes(v)) return false;
  return v !== normCity(searchCity);
}

interface LdEvent {
  '@type'?: string;
  name?: string;
  description?: string;
  startDate?: string;
  url?: string;
  image?: string | string[];
  location?: {
    '@type'?: string;
    name?: string;
    address?: { streetAddress?: string; addressLocality?: string };
  };
}

// Eventbrite's vertical pages — far more relevant per category than the
// generic /events/ page, and each paginates independently
const EB_CATEGORY_SLUGS: Record<string, string> = {
  events:      'events',
  music:       'music--events',
  food:        'food-and-drink--events',
  restaurants: 'food-and-drink--events',
  sports:      'sports-and-fitness--events',
  fitness:     'sports-and-fitness--events',
  art:         'arts--events',
  tech:        'science-and-tech--events',
  community:   'community--events',
  fashion:     'fashion--events',
  lifestyle:   'home-and-lifestyle--events',
  travel:      'travel-and-outdoor--events',
  sightseeing: 'travel-and-outdoor--events',
  discover:    'events',
};

// ── Address tidying ──────────────────────────────────────────────────────────
// Loose comparison of two location labels ("Grünbergstraße" vs "Grünbergstrasse",
// "Wien" vs "wien") so we can spot the same place named twice.
export function sameLabel(a?: string | null, b?: string | null): boolean {
  const norm = (s: string) => s.toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
  if (!a || !b) return false;
  const x = norm(a), y = norm(b);
  return Boolean(x) && Boolean(y) && (x === y || x.includes(y) || y.includes(x));
}

/** Join address parts, skipping any that repeat the venue or an earlier part. */
export function dedupeAddressParts(parts: (string | undefined | null)[], venue?: string): string {
  const kept: string[] = [];
  for (const raw of parts) {
    const part = raw?.trim();
    if (!part) continue;
    if (sameLabel(part, venue)) continue;
    if (kept.some(k => sameLabel(part, k))) continue;
    kept.push(part);
  }
  return kept.join(', ');
}

export async function fetchEventbriteEvents(
  city: string, country: string, lat: number, lng: number, count: number,
  category = 'events', page = 0
): Promise<ApiPost[]> {
  const slug = EB_CATEGORY_SLUGS[category] ?? 'events';
  const pageParam = page > 0 ? `?page=${page + 1}` : '';
  const url = `https://www.eventbrite.com/d/${slugify(country)}--${slugify(city)}/${slug}/${pageParam}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Eventbrite ${res.status}`);
  const html = await res.text();

  const today = todayStr();
  const events: LdEvent[] = [];
  for (const block of html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) ?? []) {
    try {
      const json = JSON.parse(block.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
      const items = (json.itemListElement ?? (Array.isArray(json) ? json : [json])) as { item?: LdEvent }[];
      for (const it of items) {
        const ev = (it as { item?: LdEvent }).item ?? (it as LdEvent);
        if (ev?.['@type'] !== 'Event') continue;
        // Physical, upcoming events only — skip online webinar filler
        if (ev.location?.['@type'] !== 'Place') continue;
        if (!ev.startDate || ev.startDate.slice(0, 10) < today) continue;
        // Drop big-city spill so a town's page doesn't get other cities' events
        // stamped at its centroid (see CITY_ALIASES note above).
        const loc = ev.location?.address?.addressLocality || '';
        if (loc && isDifferentMajorCity(loc, city)) continue;
        events.push(ev);
      }
    } catch { /* skip malformed block */ }
  }

  const now = Date.now();
  return events.slice(0, count).map((ev, i) => {
    const venue   = ev.location?.name ?? city;
    // Real city of the venue from the structured data — not the search city
    const evCity  = ev.location?.address?.addressLocality || city;
    // Eventbrite often names a venue after the street it is on, so naively
    // joining name + street + locality produced labels that stutter:
    // "Grünbergstraße, Grünbergstraße, Wien". Drop any part already covered by
    // an earlier one.
    const addr = dedupeAddressParts([
      ev.location?.address?.streetAddress,
      ev.location?.address?.addressLocality,
    ], venue);
    const rawDate = (ev.startDate ?? '').slice(0, 10);
    const time    = (ev.startDate ?? '').length > 10 ? (ev.startDate ?? '').slice(11, 16) : '';
    // The listing's own artwork, or none — never a stand-in.
    const image   = (Array.isArray(ev.image) ? ev.image[0] : ev.image) || '';
    const evUrl   = ev.url ?? url;
    const idMatch = evUrl.match(/(\d+)\/?$/);

    let dateStr = 'Date TBC';
    try { dateStr = new Date(`${rawDate}T${time || '00:00'}:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { /* keep TBC */ }

    return {
      id: `eb_${idMatch?.[1] ?? `${slugify(city)}_${slug}_${page}_${i}`}`,
      user: makeUser(venue, 'eventbrite.com'),
      image,
      caption: `${(ev.description ?? `${ev.name} in ${evCity}.`).slice(0, 300)}\n\n📅 ${dateStr}${time ? ` · ${time}` : ''}\n📍 ${venue}${addr ? `, ${addr}` : ''}\n🎟️ See website\n🔗 Tickets & info: ${evUrl}`,
      likes: 0,
      comments: 0,
      category: category === 'discover' ? 'events' : category,
      hashtags: [`#${evCity.replace(/\s/g, '')}`, '#events', '#nova', '#local'],
      timestamp: now - Math.random() * 7_200_000,
      location: { name: sameLabel(venue, evCity) ? evCity : `${venue}, ${evCity}`, lat, lng },
      saved: false, liked: false,
      isEvent: true, isAIGenerated: false,
      eventDate: `${dateStr}${time ? ` · ${time}` : ''}`,
      eventDateRaw: rawDate,
      eventVenue: `${venue}${addr ? `, ${addr}` : ''}`,
      eventUrl: evUrl,
      organizer: venue,
      price: 'See website',
    };
  });
}
