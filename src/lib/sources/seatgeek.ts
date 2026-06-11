// SeatGeek — extra real-event inventory where Ticketmaster is thin.
// Optional: only used when SEATGEEK_CLIENT_ID is set (free key from
// seatgeek.com/account/develop). The app works fully without it.

import { ApiPost, makeUser } from './shared';

interface SgEvent {
  id: number;
  title: string;
  url: string;
  datetime_local?: string;
  venue?: {
    name?: string;
    city?: string;
    address?: string;
    location?: { lat?: number; lon?: number };
  };
  performers?: { image?: string }[];
  stats?: { lowest_price?: number | null };
  taxonomies?: { name?: string }[];
}

const SG_CATEGORY_MAP: Record<string, string> = {
  music:  'concert',
  sports: 'sports',
  events: '',
  art:    'theater',
};

export async function fetchSeatGeekEvents(
  lat: number, lng: number, category: string, page: number, radiusKm: number, count: number,
  clientId: string, city: string
): Promise<ApiPost[]> {
  const taxonomy = SG_CATEGORY_MAP[category] ?? '';
  const url = [
    `https://api.seatgeek.com/2/events`,
    `?client_id=${clientId}`,
    `&lat=${lat}&lon=${lng}`,
    `&range=${Math.min(Math.max(radiusKm, 5), 200)}km`,
    `&per_page=${count}&page=${page + 1}`,
    `&datetime_local.gte=${new Date().toISOString().slice(0, 10)}`,
    `&sort=datetime_local.asc`,
    taxonomy ? `&taxonomies.name=${taxonomy}` : '',
  ].join('');

  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`SeatGeek ${res.status}`);
  const d = await res.json() as { events?: SgEvent[] };
  const now = Date.now();

  return (d.events ?? []).map(ev => {
    const venueName = ev.venue?.name ?? city;
    const venueCity = ev.venue?.city || city;
    const rawDate   = (ev.datetime_local ?? '').slice(0, 10);
    const time      = (ev.datetime_local ?? '').slice(11, 16);
    const price     = ev.stats?.lowest_price ? `From $${ev.stats.lowest_price}` : 'See website';
    const genre     = ev.taxonomies?.[0]?.name ?? 'event';

    let dateStr = 'Date TBC';
    try { dateStr = new Date(ev.datetime_local ?? '').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { /* keep TBC */ }

    return {
      id: `sg_${ev.id}`,
      user: makeUser(venueName, 'seatgeek.com'),
      image: ev.performers?.[0]?.image ?? `https://picsum.photos/seed/sg_${ev.id}/600/750`,
      caption: `${ev.title} — live at ${venueName}.\n\n📅 ${dateStr}${time ? ` · ${time}` : ''}\n📍 ${venueName}${ev.venue?.address ? `, ${ev.venue.address}` : ''}\n🎟️ ${price}\n🔗 Tickets & info: ${ev.url}`,
      likes: 0,
      comments: 0,
      category: category === 'discover' ? 'events' : category,
      hashtags: [`#${venueCity.replace(/\s/g, '')}`, `#${genre.replace(/\s+/g, '')}`, '#nova', '#events'],
      timestamp: now - Math.random() * 7_200_000,
      location: { name: `${venueName}, ${venueCity}`, lat: ev.venue?.location?.lat ?? 0, lng: ev.venue?.location?.lon ?? 0 },
      saved: false, liked: false,
      isEvent: true, isAIGenerated: false,
      eventDate: `${dateStr}${time ? ` · ${time}` : ''}`,
      eventDateRaw: rawDate || null,
      eventVenue: venueName,
      eventUrl: ev.url,
      organizer: venueName,
      price,
    };
  });
}
