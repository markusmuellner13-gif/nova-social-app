// Ticketmaster Discovery API — real ticketed events with real images.

import { ApiPost, makeUser, picsumUrl } from './shared';

export interface TmImage { url: string; width: number; height: number; ratio?: string; fallback?: boolean }
export interface TmEvent {
  id: string;
  name: string;
  url: string;
  images: TmImage[];
  dates: { start: { localDate?: string; localTime?: string } };
  priceRanges?: { min: number; max: number; currency: string }[];
  classifications?: { segment?: { name: string }; genre?: { name: string } }[];
  _embedded?: {
    venues?: {
      name: string;
      address?: { line1?: string };
      city?: { name: string };
      location?: { latitude?: string; longitude?: string };
    }[];
  };
}

export const TM_CATEGORY_MAP: Record<string, string[]> = {
  events:   ['Music', 'Arts & Theatre', 'Family', 'Miscellaneous'],
  music:    ['Music'],
  sports:   ['Sports'],
  art:      ['Arts & Theatre'],
  fitness:  ['Sports'],
  discover: ['Music', 'Sports', 'Arts & Theatre'],
};

export async function fetchTicketmaster(
  lat: number, lng: number, category: string, page: number, radius: number, apiKey: string,
  days = 60
): Promise<{ events: TmEvent[]; totalPages: number }> {
  const classifications = TM_CATEGORY_MAP[category] ?? TM_CATEGORY_MAP.events;
  const classParam = classifications.map(c => `classificationName=${encodeURIComponent(c)}`).join('&');
  const today = new Date();
  const end   = new Date(today); end.setDate(end.getDate() + Math.max(1, Math.min(days, 365)));
  const url = [
    `https://app.ticketmaster.com/discovery/v2/events.json`,
    `?apikey=${apiKey}`,
    `&latlong=${lat},${lng}`,
    `&radius=${radius}&unit=km`,
    `&size=8&page=${page}`,
    `&${classParam}`,
    `&startDateTime=${today.toISOString().slice(0, 19)}Z`,
    `&endDateTime=${end.toISOString().slice(0, 19)}Z`,
    `&sort=date,asc&locale=*`,
  ].join('');

  const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
  if (!res.ok) throw new Error(`TM ${res.status}`);
  const d = await res.json() as {
    _embedded?: { events?: TmEvent[] };
    page?: { totalPages?: number };
  };
  return { events: d._embedded?.events ?? [], totalPages: d.page?.totalPages ?? 0 };
}

export function bestTmImage(images: TmImage[]): string {
  if (!images?.length) return picsumUrl('event_placeholder');
  const real = images.filter(i => !i.fallback && i.url);
  const pool = real.length ? real : images;
  // Prefer true portrait ratios for 4:5 post frames; fallback to any image
  const PORTRAIT_RATIOS = new Set(['2_3', '3_4', '1_1', '4_3', '3_2']);
  const portrait = pool.filter(i => i.ratio && PORTRAIT_RATIOS.has(i.ratio));
  const source = portrait.length ? portrait : pool;
  const best = source.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
  // Ticketmaster CDN supports ?width=&height= resizing — request the exact post dimensions
  const url = best.url;
  if (url.includes('ticketmaster.com') || url.includes('livenation.com') || url.includes('ticketm.net')) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}width=600&height=750`;
  }
  return url;
}

export function tmEventToPost(ev: TmEvent, description: string, city: string): ApiPost {
  const venue     = ev._embedded?.venues?.[0];
  const venueName = venue?.name ?? city;
  const venueAddr = venue?.address?.line1 ?? '';
  // Label posts with the venue's actual city (events within the search radius
  // can be in a neighbouring town), falling back to the user's city
  const venueCity = venue?.city?.name || city;
  const lat       = parseFloat(venue?.location?.latitude  ?? '0') || 0;
  const lng       = parseFloat(venue?.location?.longitude ?? '0') || 0;
  const localDate = ev.dates?.start?.localDate ?? '';
  const localTime = ev.dates?.start?.localTime?.slice(0, 5) ?? '';
  const segment   = ev.classifications?.[0]?.segment?.name ?? 'Events';
  const genre     = ev.classifications?.[0]?.genre?.name ?? segment;
  const pr        = ev.priceRanges?.[0];
  const priceStr  = pr ? `${pr.currency} ${pr.min.toFixed(0)}–${pr.max.toFixed(0)}` : 'See website';
  const catMap: Record<string, string> = { 'Music': 'music', 'Sports': 'sports', 'Arts & Theatre': 'art', 'Family': 'events', 'Miscellaneous': 'events' };
  const category  = catMap[segment] ?? 'events';

  let eventDateStr = 'Date TBC';
  if (localDate) {
    try { eventDateStr = new Date(`${localDate}T${localTime || '00:00'}:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { /* ignore */ }
  }

  return {
    id: `tm_${ev.id}`,
    user: makeUser(venueName),
    image: bestTmImage(ev.images),
    caption: `${description}\n\n📅 ${eventDateStr}${localTime ? ` · ${localTime}` : ''}\n📍 ${venueName}${venueAddr ? `, ${venueAddr}` : ''}\n🎟️ ${priceStr}\n🔗 Tickets & info: ${ev.url}`,
    likes: 0,
    comments: 0,
    category,
    hashtags: [`#${venueCity.replace(/\s/g, '')}`, ...(genre && genre !== 'undefined' ? [`#${genre.toLowerCase().replace(/\s+/g, '')}`] : []), '#nova', '#events', '#local'],
    timestamp: Date.now() - Math.random() * 7_200_000,
    location: { name: `${venueName}, ${venueCity}`, lat, lng },
    saved: false, liked: false,
    isEvent: true, isAIGenerated: false,
    eventDate: `${eventDateStr}${localTime ? ` · ${localTime}` : ''}`,
    eventDateRaw: localDate,
    eventVenue: `${venueName}${venueAddr ? `, ${venueAddr}` : ''}`,
    eventUrl: ev.url,
    organizer: venueName,
    price: priceStr,
  };
}
