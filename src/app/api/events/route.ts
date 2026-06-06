import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TmImage { url: string; width: number; height: number; ratio?: string; fallback?: boolean }
interface TmEvent {
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
      country?: { name: string };
      location?: { latitude?: string; longitude?: string };
      url?: string;
    }[];
  };
}

interface OverpassElement {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function logoUrl(domain: string) {
  return `https://logo.clearbit.com/${domain}`;
}

function fallbackAvatar(name: string) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const colors = ['8b5cf6', 'ec4899', '3b82f6', 'f97316', '22c55e', 'f43f5e', 'a855f7', '06b6d4'];
  const color = colors[name.charCodeAt(0) % colors.length];
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${color}&color=fff&size=80&bold=true`;
}

function makeUser(name: string, domain?: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '.');
  return {
    id: `org_${slug.slice(0, 40)}`,
    name,
    username: slug.slice(0, 30),
    avatar: domain ? logoUrl(domain) : fallbackAvatar(name),
    bio: `Official Nova partner — ${name}`,
    followers: Math.floor(Math.random() * 5_000_000) + 10_000,
    following: 0,
    posts: Math.floor(Math.random() * 50_000) + 100,
    verified: true,
  };
}

function picsumUrl(seed: string) {
  const clean = seed.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 32);
  return `https://picsum.photos/seed/${clean}/600/750`;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Image fetching — Unsplash → Pexels → picsum fallback
// ─────────────────────────────────────────────────────────────────────────────

async function fetchUnsplashImage(query: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=portrait&content_filter=high`,
      { headers: { Authorization: `Client-ID ${key}` }, signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { urls?: { regular?: string } };
    return data.urls?.regular ?? null;
  } catch { return null; }
}

async function fetchPexelsImage(query: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`,
      { headers: { Authorization: key }, signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { photos?: { src?: { large?: string } }[] };
    return data.photos?.[0]?.src?.large ?? null;
  } catch { return null; }
}

async function getImage(query: string, unsplashKey?: string, pexelsKey?: string, fallbackSeed?: string): Promise<string> {
  if (unsplashKey) {
    const url = await fetchUnsplashImage(query, unsplashKey);
    if (url) return url;
  }
  if (pexelsKey) {
    const url = await fetchPexelsImage(query, pexelsKey);
    if (url) return url;
  }
  return picsumUrl(fallbackSeed ?? query);
}

// Best image from a Ticketmaster images array (prefer highest-res)
function bestTmImage(images: TmImage[]): string {
  if (!images?.length) return picsumUrl('event_placeholder');
  // Prefer non-fallback, pick widest
  const real = images.filter(i => !i.fallback && i.url);
  const pool = real.length ? real : images;
  return pool.sort((a, b) => (b.width || 0) - (a.width || 0))[0].url;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticketmaster — real events with real images
// ─────────────────────────────────────────────────────────────────────────────

const TM_CATEGORY_MAP: Record<string, string[]> = {
  events:      ['Music', 'Arts & Theatre', 'Family', 'Miscellaneous'],
  music:       ['Music'],
  sports:      ['Sports'],
  art:         ['Arts & Theatre'],
  fitness:     ['Sports'],
  discover:    ['Music', 'Sports', 'Arts & Theatre'],
};

async function fetchTicketmaster(
  lat: number, lng: number,
  category: string,
  page: number,
  radius: number,
  apiKey: string
): Promise<{ events: TmEvent[]; totalPages: number }> {
  const classifications = TM_CATEGORY_MAP[category] ?? TM_CATEGORY_MAP.events;
  const classParam = classifications.map(c => `classificationName=${encodeURIComponent(c)}`).join('&');

  const today = new Date();
  const end   = new Date(today);
  end.setDate(end.getDate() + 60);

  const startDT = today.toISOString().slice(0, 19) + 'Z';
  const endDT   = end.toISOString().slice(0, 19) + 'Z';

  const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${apiKey}&latlong=${lat},${lng}&radius=${radius}&unit=km&size=8&page=${page}&${classParam}&startDateTime=${startDT}&endDateTime=${endDT}&sort=date,asc&locale=*`;

  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`TM ${res.status}`);

  const data = await res.json() as {
    _embedded?: { events?: TmEvent[] };
    page?: { totalPages?: number };
  };

  return {
    events: data._embedded?.events ?? [],
    totalPages: data.page?.totalPages ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude — enrich event descriptions (one batch call, not per-event)
// ─────────────────────────────────────────────────────────────────────────────

async function enrichDescriptions(
  items: { name: string; venue: string; date: string; time: string; genre: string; price: string }[],
  city: string,
  apiKey: string
): Promise<string[]> {
  const prompt = `You are writing vivid post descriptions for Nova, a city discovery app.

Write a compelling 3-sentence description for each of these ${items.length} real events happening in ${city}.
Sentence 1: What the event is and who's involved.
Sentence 2: What makes this specific event special or unmissable.
Sentence 3: What the atmosphere/experience will feel like in vivid sensory detail.

Events:
${items.map((e, i) => `${i + 1}. "${e.name}" at ${e.venue} on ${e.date} at ${e.time}. Genre: ${e.genre}. Price: ${e.price}.`).join('\n')}

Respond with ONLY a JSON array of ${items.length} strings (one description per event). No markdown.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const data = await res.json() as { content?: { text?: string }[] };
  const text = data.content?.[0]?.text ?? '[]';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return items.map(e => `${e.name} at ${e.venue}.`);
  const parsed = JSON.parse(match[0]) as string[];
  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Map a Ticketmaster event to a Nova Post
// ─────────────────────────────────────────────────────────────────────────────

function tmEventToPost(ev: TmEvent, description: string, city: string, country: string) {
  const venue       = ev._embedded?.venues?.[0];
  const venueName   = venue?.name ?? city;
  const venueAddr   = venue?.address?.line1 ?? '';
  const lat         = parseFloat(venue?.location?.latitude  ?? '0') || 0;
  const lng         = parseFloat(venue?.location?.longitude ?? '0') || 0;
  const localDate   = ev.dates?.start?.localDate ?? '';
  const localTime   = ev.dates?.start?.localTime?.slice(0, 5) ?? '';
  const segment     = ev.classifications?.[0]?.segment?.name ?? 'Events';
  const genre       = ev.classifications?.[0]?.genre?.name ?? segment;
  const priceRange  = ev.priceRanges?.[0];
  const priceStr    = priceRange
    ? `${priceRange.currency} ${priceRange.min.toFixed(0)}–${priceRange.max.toFixed(0)}`
    : 'See website';

  const categoryMap: Record<string, string> = {
    'Music': 'music', 'Sports': 'sports', 'Arts & Theatre': 'art',
    'Family': 'events', 'Miscellaneous': 'events',
  };
  const category = categoryMap[segment] ?? 'events';

  let eventDateStr = 'Date TBC';
  if (localDate) {
    try {
      const dt = new Date(`${localDate}T${localTime || '00:00'}:00`);
      eventDateStr = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch { /* ignore */ }
  }

  const caption = `${description}\n\n📅 ${eventDateStr}${localTime ? ` · ${localTime}` : ''}\n📍 ${venueName}${venueAddr ? `, ${venueAddr}` : ''}\n🎟️ ${priceStr}\n🔗 Tickets & info: ${ev.url}`;

  const hashtags = [
    `#${city.replace(/\s/g, '')}`,
    `#${genre.toLowerCase().replace(/\s/g, '')}`,
    '#nova', '#events', '#local',
  ];

  return {
    id: `tm_${ev.id}`,
    user: makeUser(venueName, undefined),
    image: bestTmImage(ev.images),
    caption,
    likes: Math.floor(Math.random() * 20_000) + 1_000,
    comments: Math.floor(Math.random() * 800) + 30,
    category,
    hashtags,
    timestamp: Date.now() - Math.random() * 7_200_000,
    location: { name: `${venueName}, ${city}`, lat, lng },
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

// ─────────────────────────────────────────────────────────────────────────────
// Overpass API — real sightseeing POIs (no API key needed)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchOverpassPOIs(lat: number, lng: number, radius: number): Promise<OverpassElement[]> {
  const query = `[out:json][timeout:8];
(
  node["tourism"~"museum|gallery|attraction|viewpoint|artwork|monument|zoo|aquarium|theme_park"](around:${radius},${lat},${lng});
  node["historic"~"monument|castle|ruins|archaeological_site|memorial|building|church"](around:${radius},${lat},${lng});
  node["amenity"~"theatre|cinema|arts_centre|library"](around:${radius},${lat},${lng});
  way["tourism"~"museum|gallery|attraction|viewpoint"](around:${radius},${lat},${lng});
  relation["tourism"="museum"](around:${radius},${lat},${lng});
);
out center 20;`;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(7000),
  });

  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const data = await res.json() as { elements?: OverpassElement[] };
  return (data.elements ?? []).filter(el => el.tags?.name);
}

async function sightseeingPOIToPost(
  el: OverpassElement,
  city: string,
  country: string,
  description: string,
  imageUrl: string
) {
  const name    = el.tags.name;
  const type    = el.tags.tourism || el.tags.historic || el.tags.amenity || 'attraction';
  const website = el.tags.website || el.tags['contact:website'];
  const hours   = el.tags.opening_hours;
  const fee     = el.tags.fee === 'no' ? 'Free entry' : el.tags.fee ? `Fee: ${el.tags.fee}` : 'See website';
  const addr    = el.tags['addr:street']
    ? `${el.tags['addr:street']} ${el.tags['addr:housenumber'] ?? ''}`.trim()
    : '';

  const lat = el.lat ?? el.center?.lat ?? 0;
  const lng = el.lon ?? el.center?.lon ?? 0;

  const caption = `${description}\n\n🏛️ ${type.replace(/_/g, ' ')}\n📍 ${name}${addr ? `, ${addr}` : ''}, ${city}\n🕐 ${hours || 'Check website for hours'}\n🎟️ ${fee}${website ? `\n🔗 More info: ${website}` : ''}`;

  const hashtags = [
    `#${city.replace(/\s/g, '')}`,
    `#${type.replace(/_/g, '')}`,
    '#sightseeing', '#nova', '#travel',
  ];

  return {
    id: `osm_${el.id}`,
    user: makeUser(name),
    image: imageUrl,
    caption,
    likes: Math.floor(Math.random() * 30_000) + 2_000,
    comments: Math.floor(Math.random() * 600) + 20,
    category: 'sightseeing',
    hashtags,
    timestamp: Date.now() - Math.random() * 86_400_000,
    location: { name: `${name}, ${city}`, lat, lng },
    saved: false, liked: false,
    isEvent: false, isAIGenerated: false,
    eventUrl: website,
    organizer: name,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude — generate sightseeing descriptions for POIs in one batch
// ─────────────────────────────────────────────────────────────────────────────

async function enrichSightseeingDescriptions(
  pois: { name: string; type: string; city: string }[],
  claudeKey: string
): Promise<string[]> {
  const prompt = `You are writing vivid attraction descriptions for Nova, a city discovery app.

Write a compelling 3-sentence description for each of these ${pois.length} real places in ${pois[0]?.city}.
Sentence 1: What the place is and its historical/cultural significance.
Sentence 2: What makes it unique or why visitors love it.
Sentence 3: What the experience of visiting feels like in vivid sensory detail.

Places:
${pois.map((p, i) => `${i + 1}. "${p.name}" (${p.type.replace(/_/g, ' ')})`).join('\n')}

Respond with ONLY a JSON array of ${pois.length} strings. No markdown.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) return pois.map(p => `${p.name} is a must-visit ${p.type.replace(/_/g, ' ')} in ${p.city}.`);
  const data = await res.json() as { content?: { text?: string }[] };
  const text = data.content?.[0]?.text ?? '[]';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return pois.map(p => `${p.name} is a remarkable landmark in ${p.city}.`);
  return JSON.parse(match[0]) as string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback — Claude-generated events when Ticketmaster key not set
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_PROMPT_GUIDE: Record<string, string> = {
  events:      'Mix types: concerts, club nights, comedy, theatre, open-air cinema, festivals, pop-up markets, cultural celebrations, exhibitions.',
  music:       'Music events only: concerts, club nights, jazz evenings, open mic nights, DJ sets, music festivals, vinyl fairs, live band showcases.',
  sports:      'Sports events: football/soccer matches, athletics, tennis, basketball, cycling races, swimming, martial arts, rugby, hockey, fun runs, amateur leagues.',
  fitness:     'Fitness & wellness: outdoor yoga, running clubs, cycling events, gym open days, hiking groups, wellness retreats, team sports.',
  food:        'Food & drink: restaurant weeks, food festivals, pop-up dining, wine tastings, cooking masterclasses, street food markets, chef\'s tables.',
  art:         'Art & culture: gallery openings, museum exhibitions, street art tours, art fairs, photography exhibits, artist talks, cultural festivals.',
  sightseeing: 'Sightseeing: landmark guided tours, museum visits, viewpoints, historic sites, river cruises, architectural walks, cultural heritage experiences.',
  lifestyle:   'Lifestyle: night markets, open-air cinema, pop-up boutiques, craft fairs, wellness events, community gatherings.',
  discover:    'Mix of the best local events: concerts, food festivals, art openings, sports, markets, fitness classes, cultural experiences.',
};

async function generateFallbackEvents(
  city: string, country: string, today: string, count: number, page: number, category: string, claudeKey: string
) {
  const guidance = CATEGORY_PROMPT_GUIDE[category] ?? CATEGORY_PROMPT_GUIDE.events;
  const offset = page * count;

  const prompt = `You are a hyper-local event discovery engine for Nova.

Generate exactly ${count} unique upcoming real events in ${city}, ${country}. Today is ${today}.
Skip the first ${offset} most obvious events to ensure variety.

Category: ${guidance}

For each event return this JSON:
{
  "title": "specific event title",
  "organizer": "real venue or organisation name",
  "website": "real domain (e.g. 'timeout.com', 'ra.co')",
  "venue": "specific venue name",
  "address": "street address or district",
  "date": "YYYY-MM-DD (within next 45 days from ${today})",
  "time": "HH:MM",
  "price": "price or Free",
  "description": "3 vivid sentences: what it is, what makes it special, what it feels like",
  "url": "realistic ticket/info URL",
  "category": "${category === 'discover' ? 'events|music|sports|art|fitness|food|lifestyle' : category}",
  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"],
  "imageQuery": "3-word portrait photo search query"
}

Respond ONLY with a valid JSON array. No markdown.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 6000,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(9000),
  });

  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const data = await res.json() as { content?: { text?: string }[] };
  const text = data.content?.[0]?.text ?? '[]';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  const events = JSON.parse(match[0]) as Record<string, unknown>[];
  const now = Date.now();

  return events.map((ev, i) => {
    const title     = String(ev.title ?? `Event ${i + 1}`);
    const organizer = String(ev.organizer ?? title);
    const website   = String(ev.website ?? '');
    const venue     = String(ev.venue ?? city);
    const address   = String(ev.address ?? '');
    const date      = String(ev.date ?? '');
    const time      = String(ev.time ?? '19:00');
    const price     = String(ev.price ?? 'See website');
    const desc      = String(ev.description ?? '');
    const url       = String(ev.url ?? '#');
    const cat       = String(ev.category ?? category);
    const hashtags  = Array.isArray(ev.hashtags) ? ev.hashtags as string[] : [`#${city}`, '#events'];
    const imgQuery  = String(ev.imageQuery ?? `${cat} ${city}`);

    let eventDateStr = 'Date TBC';
    if (date) {
      try {
        eventDateStr = new Date(`${date}T${time}:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      } catch { /* ignore */ }
    }

    return {
      id: `cl_${city}_${page}_${i}_${Date.now()}`,
      user: makeUser(organizer, website || undefined),
      image: picsumUrl(`${city}_${cat}_${page}_${i}`),
      caption: `${desc}\n\n📅 ${eventDateStr}${time ? ` · ${time}` : ''}\n📍 ${venue}${address ? `, ${address}` : ''}\n🎟️ ${price}\n🔗 Tickets & info: ${url}`,
      likes: Math.floor(Math.random() * 12_000) + 500,
      comments: Math.floor(Math.random() * 400) + 20,
      category: cat,
      hashtags,
      timestamp: now - Math.random() * 10_800_000,
      location: { name: `${venue}, ${city}`, lat: 0, lng: 0 },
      saved: false, liked: false,
      isEvent: true, isAIGenerated: true,
      eventDate: `${eventDateStr}${time ? ` · ${time}` : ''}`,
      eventDateRaw: date || null,
      eventVenue: `${venue}${address ? `, ${address}` : ''}`,
      eventUrl: url,
      organizer,
      price,
    };
  });
}

// Hardcoded fallback for when all APIs fail
function hardFallback(city: string, country: string, page: number, count: number) {
  const templates = [
    { title: 'Live Music Night', cat: 'music', domain: 'ra.co', price: '€15', desc: `A night of live music in ${city} with local and international acts.` },
    { title: `${city} Food Festival`, cat: 'food', domain: 'eventbrite.com', price: 'Free', desc: `Over 50 food vendors gather in ${city} for the best street food weekend.` },
    { title: 'Contemporary Art Exhibition', cat: 'art', domain: 'artfair.com', price: '€12', desc: `Local and international galleries showcase cutting-edge work in ${city}.` },
    { title: 'Half Marathon', cat: 'sports', domain: 'active.com', price: '€25', desc: `Join thousands of runners through the scenic streets of ${city}.` },
    { title: 'Tech Meetup', cat: 'events', domain: 'meetup.com', price: 'Free', desc: `Founders, developers, and investors gather for talks and networking in ${city}.` },
    { title: 'Night Market', cat: 'lifestyle', domain: 'timeout.com', price: 'Free', desc: `200 stalls of vintage clothing, crafts, vinyl, and artisan food in ${city}.` },
    { title: 'Open Air Cinema', cat: 'events', domain: 'timeout.com', price: '€12', desc: `Films under the stars at ${city}'s most iconic outdoor venue.` },
    { title: 'Sightseeing Tour', cat: 'sightseeing', domain: 'viator.com', price: '€18', desc: `Discover the hidden gems and iconic landmarks of ${city} with a local guide.` },
  ];
  const now = Date.now();
  return templates.slice(0, count).map((t, i) => {
    const daysAhead = ((page * count + i) % 30) + 1;
    const eventDate = new Date(now + daysAhead * 86_400_000);
    const dateStr = eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const rawDate = eventDate.toISOString().split('T')[0];
    return {
      id: `fb_${city}_${page}_${i}`,
      user: makeUser(t.title, t.domain),
      image: picsumUrl(`${city}_${t.cat}_${page}_${i}`),
      caption: `${t.desc}\n\n📅 ${dateStr}, 19:00\n📍 ${city}, ${country}\n🎟️ ${t.price}\n🔗 https://${t.domain}`,
      likes: Math.floor(Math.random() * 8_000) + 300,
      comments: Math.floor(Math.random() * 200) + 10,
      category: t.cat,
      hashtags: [`#${city.replace(/\s/g, '')}`, `#${t.cat}`, '#nova', '#local'],
      timestamp: now - Math.random() * 7_200_000,
      location: { name: `${city}, ${country}`, lat: 0, lng: 0 },
      saved: false, liked: false,
      isEvent: true, isAIGenerated: true,
      eventDate: `${dateStr} · 19:00`,
      eventDateRaw: rawDate,
      eventVenue: city,
      eventUrl: `https://${t.domain}`,
      organizer: t.title,
      price: t.price,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const city     = searchParams.get('city')     || 'Vienna';
  const country  = searchParams.get('country')  || 'Austria';
  const lat      = parseFloat(searchParams.get('lat') || '48.2082');
  const lng      = parseFloat(searchParams.get('lng') || '16.3738');
  const page     = parseInt(searchParams.get('page')     || '0', 10);
  const radius   = parseInt(searchParams.get('radius')   || '25', 10);
  const count    = parseInt(searchParams.get('count')    || '8', 10);
  const category = searchParams.get('category') || 'events';

  const tmKey       = process.env.TICKETMASTER_API_KEY;
  const claudeKey   = process.env.ANTHROPIC_API_KEY;
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  const pexelsKey   = process.env.PEXELS_API_KEY;

  const today = todayStr();

  // ── SIGHTSEEING: Overpass + Unsplash/Pexels + Claude ──────────────────────
  if (category === 'sightseeing') {
    try {
      const pois = await fetchOverpassPOIs(lat, lng, radius * 1000);
      if (pois.length === 0) throw new Error('No POIs found');

      // Paginate POIs
      const pagePOIs = pois.slice(page * count, page * count + count);
      if (pagePOIs.length === 0) {
        return NextResponse.json({ posts: [], city, country, source: 'overpass', hasMore: false });
      }

      // Fetch descriptions and images in parallel
      const [descriptions, images] = await Promise.all([
        claudeKey
          ? enrichSightseeingDescriptions(
              pagePOIs.map(el => ({
                name: el.tags.name,
                type: el.tags.tourism || el.tags.historic || el.tags.amenity || 'attraction',
                city,
              })),
              claudeKey
            )
          : Promise.resolve(pagePOIs.map(el => `${el.tags.name} is a remarkable landmark in ${city}.`)),
        Promise.all(
          pagePOIs.map(el =>
            getImage(
              `${el.tags.name} ${city} ${el.tags.tourism || el.tags.historic || 'landmark'}`,
              unsplashKey, pexelsKey,
              `osm_${el.id}`
            )
          )
        ),
      ]);

      const posts = await Promise.all(
        pagePOIs.map((el, i) =>
          sightseeingPOIToPost(el, city, country, descriptions[i] ?? '', images[i] ?? picsumUrl(`osm_${el.id}`))
        )
      );

      const hasMore = (page + 1) * count < pois.length;
      return NextResponse.json({ posts, city, country, source: 'overpass', hasMore });
    } catch (err) {
      console.error('[events/sightseeing]', err);
      // Fall through to Claude fallback below
    }
  }

  // ── EVENTS/SPORTS/MUSIC: Ticketmaster (real events + real images) ──────────
  if (tmKey && category !== 'sightseeing') {
    try {
      const { events: tmEvents, totalPages } = await fetchTicketmaster(lat, lng, category, page, radius, tmKey);

      if (tmEvents.length === 0) {
        return NextResponse.json({
          posts: [],
          city, country,
          source: 'ticketmaster',
          hasMore: false,
          totalPages,
        });
      }

      // Enrich descriptions with Claude (one batch call)
      const enrichInput = tmEvents.map(ev => ({
        name: ev.name,
        venue: ev._embedded?.venues?.[0]?.name ?? city,
        date: ev.dates?.start?.localDate ?? today,
        time: ev.dates?.start?.localTime?.slice(0, 5) ?? '19:00',
        genre: ev.classifications?.[0]?.genre?.name ?? ev.classifications?.[0]?.segment?.name ?? 'Event',
        price: ev.priceRanges?.[0]
          ? `${ev.priceRanges[0].currency} ${ev.priceRanges[0].min.toFixed(0)}–${ev.priceRanges[0].max.toFixed(0)}`
          : 'See website',
      }));

      const descriptions = claudeKey
        ? await enrichDescriptions(enrichInput, city, claudeKey).catch(() =>
            tmEvents.map(ev => `${ev.name} at ${ev._embedded?.venues?.[0]?.name ?? city}.`)
          )
        : tmEvents.map(ev => `${ev.name} at ${ev._embedded?.venues?.[0]?.name ?? city}.`);

      const posts = tmEvents.map((ev, i) =>
        tmEventToPost(ev, descriptions[i] ?? '', city, country)
      );

      const hasMore = page < totalPages - 1;
      return NextResponse.json({ posts, city, country, source: 'ticketmaster', hasMore, totalPages });
    } catch (err) {
      console.error('[events/ticketmaster]', err);
      // Fall through to Claude fallback
    }
  }

  // ── FALLBACK: Claude-generated events ─────────────────────────────────────
  if (claudeKey) {
    try {
      const posts = await generateFallbackEvents(city, country, today, count, page, category, claudeKey);
      // Claude has no real pagination limit — always hasMore for first 10 pages
      return NextResponse.json({ posts, city, country, source: 'claude', hasMore: page < 10 });
    } catch (err) {
      console.error('[events/claude]', err);
    }
  }

  // ── LAST RESORT: hardcoded templates ──────────────────────────────────────
  const posts = hardFallback(city, country, page, count);
  return NextResponse.json({ posts, city, country, source: 'fallback', hasMore: page < 5 });
}
