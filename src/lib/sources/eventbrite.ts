// Eventbrite public city pages — FREE real events via schema.org JSON-LD.
// No API key, no AI credits — reads the structured data embedded in the page.
// Supports per-category pages and deep pagination (?page=N) so every category
// has a real, endless stream.

import { ApiPost, makeUser, picsumUrl, slugify, todayStr } from './shared';

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
        events.push(ev);
      }
    } catch { /* skip malformed block */ }
  }

  const now = Date.now();
  return events.slice(0, count).map((ev, i) => {
    const venue   = ev.location?.name ?? city;
    // Real city of the venue from the structured data — not the search city
    const evCity  = ev.location?.address?.addressLocality || city;
    const addr    = [ev.location?.address?.streetAddress, ev.location?.address?.addressLocality].filter(Boolean).join(', ');
    const rawDate = (ev.startDate ?? '').slice(0, 10);
    const time    = (ev.startDate ?? '').length > 10 ? (ev.startDate ?? '').slice(11, 16) : '';
    const image   = (Array.isArray(ev.image) ? ev.image[0] : ev.image) || picsumUrl(`eb_${city}_${page}_${i}`);
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
      likes: Math.floor(Math.random() * 9_000) + 300,
      comments: Math.floor(Math.random() * 300) + 10,
      category: category === 'discover' ? 'events' : category,
      hashtags: [`#${evCity.replace(/\s/g, '')}`, '#events', '#nova', '#local'],
      timestamp: now - Math.random() * 7_200_000,
      location: { name: `${venue}, ${evCity}`, lat, lng },
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
