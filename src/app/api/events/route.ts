import { NextRequest, NextResponse } from 'next/server';

// Prevent Vercel CDN from caching — events must always be fresh
const NO_CACHE = { 'Cache-Control': 'no-store, max-age=0' };

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
      location?: { latitude?: string; longitude?: string };
    }[];
  };
}

interface WikiGeoResult {
  pageid: number;
  title: string;
  lat: number;
  lon: number;
  dist: number;
}

interface WikiSummary {
  title: string;
  description?: string;
  extract?: string;
  thumbnail?: { source: string };
  content_urls?: { desktop?: { page?: string } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function fallbackAvatar(name: string) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const colors = ['8b5cf6', 'ec4899', '3b82f6', 'f97316', '22c55e', 'f43f5e', 'a855f7', '06b6d4'];
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${colors[name.charCodeAt(0) % colors.length]}&color=fff&size=80&bold=true`;
}

function logoUrl(domain: string) { return `https://logo.clearbit.com/${domain}`; }

function makeUser(name: string, domain?: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '.').slice(0, 30);
  return {
    id: `org_${slug}`,
    name,
    username: slug,
    avatar: domain ? logoUrl(domain) : fallbackAvatar(name),
    bio: `Official Nova partner — ${name}`,
    followers: Math.floor(Math.random() * 5_000_000) + 10_000,
    following: 0,
    posts: Math.floor(Math.random() * 50_000) + 100,
    verified: true,
  };
}

function picsumUrl(seed: string) {
  return `https://picsum.photos/seed/${seed.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 32)}/600/750`;
}

function todayStr() { return new Date().toISOString().split('T')[0]; }

// ─────────────────────────────────────────────────────────────────────────────
// Image helpers — Unsplash → Pexels → picsum
// ─────────────────────────────────────────────────────────────────────────────

async function fetchUnsplashImage(query: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=portrait&content_filter=high`,
      { headers: { Authorization: `Client-ID ${key}` }, signal: AbortSignal.timeout(3500) }
    );
    if (!res.ok) return null;
    const d = await res.json() as { urls?: { regular?: string } };
    return d.urls?.regular ?? null;
  } catch { return null; }
}

async function fetchPexelsImage(query: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`,
      { headers: { Authorization: key }, signal: AbortSignal.timeout(3500) }
    );
    if (!res.ok) return null;
    const d = await res.json() as { photos?: { src?: { large?: string } }[] };
    return d.photos?.[0]?.src?.large ?? null;
  } catch { return null; }
}

async function getImage(query: string, unsplashKey?: string, pexelsKey?: string, seed?: string): Promise<string> {
  if (unsplashKey) { const u = await fetchUnsplashImage(query, unsplashKey); if (u) return u; }
  if (pexelsKey)   { const u = await fetchPexelsImage(query, pexelsKey);     if (u) return u; }
  return picsumUrl(seed ?? query);
}

function bestTmImage(images: TmImage[]): string {
  if (!images?.length) return picsumUrl('event_placeholder');
  const real = images.filter(i => !i.fallback && i.url);
  const pool = real.length ? real : images;
  return pool.sort((a, b) => (b.width || 0) - (a.width || 0))[0].url;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wikipedia — real sightseeing POIs with real photos (free, no key)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchWikipediaNearby(lat: number, lng: number, radiusM: number): Promise<WikiGeoResult[]> {
  const r = Math.min(Math.max(radiusM, 1000), 10000); // Wikipedia max: 10000m
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=${r}&gslimit=50&format=json&origin=*`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Wikipedia GeoSearch ${res.status}`);
  const d = await res.json() as { query?: { geosearch?: WikiGeoResult[] } };
  return d.query?.geosearch ?? [];
}

async function fetchWikipediaSummary(title: string): Promise<WikiSummary | null> {
  try {
    const encoded = encodeURIComponent(title.replace(/ /g, '_'));
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return null;
    return await res.json() as WikiSummary;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticketmaster — real events with real images
// ─────────────────────────────────────────────────────────────────────────────

const TM_CATEGORY_MAP: Record<string, string[]> = {
  events:   ['Music', 'Arts & Theatre', 'Family', 'Miscellaneous'],
  music:    ['Music'],
  sports:   ['Sports'],
  art:      ['Arts & Theatre'],
  fitness:  ['Sports'],
  discover: ['Music', 'Sports', 'Arts & Theatre'],
};

async function fetchTicketmaster(
  lat: number, lng: number, category: string, page: number, radius: number, apiKey: string
): Promise<{ events: TmEvent[]; totalPages: number }> {
  const classifications = TM_CATEGORY_MAP[category] ?? TM_CATEGORY_MAP.events;
  const classParam = classifications.map(c => `classificationName=${encodeURIComponent(c)}`).join('&');
  const today = new Date();
  const end   = new Date(today); end.setDate(end.getDate() + 60);
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

function tmEventToPost(ev: TmEvent, description: string, city: string, country: string) {
  const venue     = ev._embedded?.venues?.[0];
  const venueName = venue?.name ?? city;
  const venueAddr = venue?.address?.line1 ?? '';
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
    likes: Math.floor(Math.random() * 20_000) + 1_000,
    comments: Math.floor(Math.random() * 800) + 30,
    category,
    hashtags: [`#${city.replace(/\s/g, '')}`, `#${genre.toLowerCase().replace(/\s/g, '')}`, '#nova', '#events', '#local'],
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
// Claude — batch description enrichment
// ─────────────────────────────────────────────────────────────────────────────

async function enrichEventDescriptions(
  items: { name: string; venue: string; date: string; time: string; genre: string; price: string }[],
  city: string, apiKey: string
): Promise<string[]> {
  const prompt = `Write a vivid 3-sentence description for each of these ${items.length} real events in ${city}.
Sentence 1: what the event is and who's performing/involved.
Sentence 2: what makes this specific event unmissable.
Sentence 3: what the atmosphere will feel like in sensory detail.

${items.map((e, i) => `${i + 1}. "${e.name}" at ${e.venue} · ${e.date} ${e.time} · ${e.genre} · ${e.price}`).join('\n')}

Respond ONLY with a JSON array of ${items.length} strings. No markdown.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const d = await res.json() as { content?: { text?: string }[] };
  const match = (d.content?.[0]?.text ?? '').match(/\[[\s\S]*\]/);
  if (!match) return items.map(e => `${e.name} at ${e.venue}.`);
  return JSON.parse(match[0]) as string[];
}

async function enrichSightseeingDescriptions(
  pois: { name: string; extract: string }[],
  city: string, apiKey: string
): Promise<string[]> {
  const prompt = `Make these ${pois.length} Wikipedia descriptions more vivid and exciting for a social discovery app in ${city}.
Keep all factual details. Rewrite to 3 punchy sentences each: what it is + why it's special + what visiting feels like.

${pois.map((p, i) => `${i + 1}. ${p.name}: "${p.extract?.slice(0, 200) ?? 'A landmark in ' + city}"`).join('\n')}

Respond ONLY with a JSON array of ${pois.length} strings. No markdown.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`Claude sightseeing ${res.status}`);
  const d = await res.json() as { content?: { text?: string }[] };
  const match = (d.content?.[0]?.text ?? '').match(/\[[\s\S]*\]/);
  if (!match) return pois.map(p => p.extract?.slice(0, 300) ?? `${p.name} is a remarkable landmark in ${city}.`);
  return JSON.parse(match[0]) as string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude — generate events when Ticketmaster has no coverage
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_GUIDANCE: Record<string, string> = {
  events:      'Mix of concerts, club nights, comedy, theatre, festivals, pop-up markets, cultural celebrations.',
  music:       'Concerts, club nights, jazz evenings, open mic nights, DJ sets, music festivals, live bands.',
  sports:      'Football/soccer matches, athletics, tennis, basketball, cycling, swimming, martial arts, rugby, fun runs. Include local league matches, not just big international events.',
  fitness:     'Outdoor yoga, running clubs, cycling events, gym open days, hiking groups, wellness retreats.',
  food:        'Restaurant weeks, food festivals, pop-up dining, wine tastings, cooking masterclasses, street food markets.',
  art:         'Gallery openings, museum exhibitions, street art tours, art fairs, photography exhibits, artist talks.',
  sightseeing: 'Guided landmark tours, museum timed entries, viewpoint access, historic site visits, river cruises, architectural walks.',
  lifestyle:   'Night markets, open-air cinema, pop-up boutiques, craft fairs, wellness events, community gatherings.',
  discover:    'Best mix of local events: concerts, food festivals, art openings, sports, markets, fitness classes.',
};

async function generateWithClaude(
  city: string, country: string, today: string, count: number, page: number, category: string, apiKey: string
) {
  const guidance = CATEGORY_GUIDANCE[category] ?? CATEGORY_GUIDANCE.events;

  const prompt = `You are a hyper-local event discovery engine for Nova.

Generate exactly ${count} unique, realistic upcoming events/experiences in ${city}, ${country}. Today is ${today}.
Skip the first ${page * count} most obvious results for variety across pages.

Category focus: ${guidance}

For each item return exactly this JSON:
{
  "title": "specific event/experience title",
  "organizer": "real venue or organisation in ${city}",
  "website": "real organiser domain (e.g. 'ra.co', 'timeout.com', 'seatgeek.com')",
  "venue": "specific venue name in ${city}",
  "address": "street address or district",
  "date": "YYYY-MM-DD (within next 45 days)",
  "time": "HH:MM",
  "price": "specific price or Free",
  "description": "3 vivid sentences: what it is, why unmissable, what it feels like",
  "url": "realistic ticket/info URL for this specific event",
  "category": "${category}",
  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"],
  "imageQuery": "3-word portrait photo search query"
}

Respond ONLY with a valid JSON array. No markdown.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 6000, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`Claude gen ${res.status}`);
  const d = await res.json() as { content?: { text?: string }[] };
  const match = (d.content?.[0]?.text ?? '').match(/\[[\s\S]*\]/);
  if (!match) return [];

  const events = JSON.parse(match[0]) as Record<string, unknown>[];
  const now = Date.now();

  return events.map((ev, i) => {
    const title    = String(ev.title ?? `Event ${i + 1}`);
    const org      = String(ev.organizer ?? title);
    const website  = String(ev.website ?? '');
    const venue    = String(ev.venue ?? city);
    const address  = String(ev.address ?? '');
    const date     = String(ev.date ?? '');
    const time     = String(ev.time ?? '19:00');
    const price    = String(ev.price ?? 'See website');
    const desc     = String(ev.description ?? '');
    const url      = String(ev.url ?? '#');
    const cat      = String(ev.category ?? category);
    const tags     = Array.isArray(ev.hashtags) ? ev.hashtags as string[] : [`#${city}`, '#events'];
    const imgQ     = String(ev.imageQuery ?? `${cat} ${city}`);

    let eventDateStr = 'Date TBC';
    if (date) { try { eventDateStr = new Date(`${date}T${time}:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch { /* ignore */ } }

    return {
      id: `cl_${city}_p${page}_${i}_${Date.now()}`,
      user: makeUser(org, website || undefined),
      image: picsumUrl(`${city}_${cat}_${page}_${i}`),
      caption: `${desc}\n\n📅 ${eventDateStr}${time ? ` · ${time}` : ''}\n📍 ${venue}${address ? `, ${address}` : ''}\n🎟️ ${price}\n🔗 Tickets & info: ${url}`,
      likes: Math.floor(Math.random() * 12_000) + 500,
      comments: Math.floor(Math.random() * 400) + 20,
      category: cat,
      hashtags: tags,
      timestamp: now - Math.random() * 10_800_000,
      location: { name: `${venue}, ${city}`, lat: 0, lng: 0 },
      saved: false, liked: false,
      isEvent: true, isAIGenerated: true,
      eventDate: `${eventDateStr}${time ? ` · ${time}` : ''}`,
      eventDateRaw: date || null,
      eventVenue: `${venue}${address ? `, ${address}` : ''}`,
      eventUrl: url,
      organizer: org,
      price,
    };
  });
}

// Hardcoded last-resort fallback
function hardFallback(city: string, country: string, page: number, count: number) {
  const templates = [
    { title: 'Live Music Night', cat: 'music', domain: 'ra.co', price: '€15' },
    { title: `${city} Food Festival`, cat: 'food', domain: 'eventbrite.com', price: 'Free' },
    { title: 'Art Exhibition Opening', cat: 'art', domain: 'artfair.com', price: '€12' },
    { title: 'City Half Marathon', cat: 'sports', domain: 'active.com', price: '€25' },
    { title: 'Tech Meetup', cat: 'events', domain: 'meetup.com', price: 'Free' },
    { title: 'Night Market', cat: 'lifestyle', domain: 'timeout.com', price: 'Free' },
    { title: 'Open Air Cinema', cat: 'events', domain: 'timeout.com', price: '€12' },
    { title: 'Sightseeing Tour', cat: 'sightseeing', domain: 'viator.com', price: '€18' },
  ];
  const now = Date.now();
  return templates.slice(0, count).map((t, i) => {
    const daysAhead = ((page * count + i) % 30) + 1;
    const eventDate = new Date(now + daysAhead * 86_400_000);
    const rawDate = eventDate.toISOString().split('T')[0];
    const dateStr = eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    return {
      id: `fb_${city}_p${page}_${i}`,
      user: makeUser(t.title, t.domain),
      image: picsumUrl(`${city}_${t.cat}_${page}_${i}`),
      caption: `Local ${t.title.toLowerCase()} happening in ${city}.\n\n📅 ${dateStr}, 19:00\n📍 ${city}, ${country}\n🎟️ ${t.price}\n🔗 https://${t.domain}`,
      likes: Math.floor(Math.random() * 5_000) + 100,
      comments: Math.floor(Math.random() * 100) + 5,
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
// Main route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const city     = searchParams.get('city')     || 'Vienna';
  const country  = searchParams.get('country')  || 'Austria';
  const lat      = parseFloat(searchParams.get('lat') || '48.2082');
  const lng      = parseFloat(searchParams.get('lng') || '16.3738');
  const page     = parseInt(searchParams.get('page')   || '0', 10);
  const radius   = parseInt(searchParams.get('radius') || '25', 10);
  const count    = parseInt(searchParams.get('count')  || '8', 10);
  const category = searchParams.get('category') || 'events';

  const tmKey       = process.env.TICKETMASTER_API_KEY;
  const claudeKey   = process.env.ANTHROPIC_API_KEY;
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  const pexelsKey   = process.env.PEXELS_API_KEY;
  const today       = todayStr();

  // ── SIGHTSEEING: Wikipedia GeoSearch + Summary API (free, real photos) ────
  if (category === 'sightseeing') {
    try {
      // Use radius in meters, capped at Wikipedia's max of 10000m
      const radiusM = Math.min(radius * 1000, 10000);
      const nearby = await fetchWikipediaNearby(lat, lng, radiusM);

      if (nearby.length === 0) throw new Error('No Wikipedia articles nearby');

      // Paginate through the 50 results
      const pagePOIs = nearby.slice(page * count, page * count + count);
      if (pagePOIs.length === 0) {
        return NextResponse.json({ posts: [], city, country, source: 'wikipedia', hasMore: false }, { headers: NO_CACHE });
      }

      // Fetch summaries (real descriptions + real Wikipedia photos) in parallel
      const summaries = await Promise.all(pagePOIs.map(p => fetchWikipediaSummary(p.title)));

      // Enrich with Claude for social-friendly descriptions
      const poiData = pagePOIs.map((p, i) => ({
        name: p.title,
        extract: summaries[i]?.extract ?? `${p.title} is a landmark near ${city}.`,
      }));

      const descriptions = claudeKey
        ? await enrichSightseeingDescriptions(poiData, city, claudeKey)
            .catch(() => poiData.map(p => p.extract.slice(0, 300)))
        : poiData.map(p => p.extract.slice(0, 300));

      const posts = await Promise.all(pagePOIs.map(async (poi, i) => {
        const summary = summaries[i];
        const wikiImg = summary?.thumbnail?.source;
        const wikiUrl = summary?.content_urls?.desktop?.page
          ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(poi.title.replace(/ /g, '_'))}`;

        // Prefer Wikipedia's own image; fall back to Unsplash/Pexels/picsum
        const image = wikiImg
          ?? await getImage(`${poi.title} ${city} landmark`, unsplashKey, pexelsKey, `wiki_${poi.pageid}`);

        const desc = descriptions[i] ?? poiData[i].extract.slice(0, 300);

        return {
          id: `wiki_${poi.pageid}`,
          user: makeUser(poi.title),
          image,
          caption: `${desc}\n\n🏛️ ${summary?.description ?? 'Landmark'}\n📍 ${poi.title}, ${city}\n📏 ${Math.round(poi.dist)}m from centre\n🔗 Learn more: ${wikiUrl}`,
          likes: Math.floor(Math.random() * 30_000) + 2_000,
          comments: Math.floor(Math.random() * 600) + 20,
          category: 'sightseeing',
          hashtags: [`#${city.replace(/\s/g, '')}`, '#sightseeing', '#nova', '#travel', '#landmark'],
          timestamp: Date.now() - Math.random() * 86_400_000,
          location: { name: `${poi.title}, ${city}`, lat: poi.lat, lng: poi.lon },
          saved: false, liked: false,
          isEvent: false, isAIGenerated: false,
          eventUrl: wikiUrl,
          organizer: poi.title,
        };
      }));

      const hasMore = (page + 1) * count < nearby.length;
      return NextResponse.json({ posts, city, country, source: 'wikipedia', hasMore }, { headers: NO_CACHE });
    } catch (err) {
      console.error('[events/sightseeing/wikipedia]', err);
      // Fall through to Claude for sightseeing
    }
  }

  // ── EVENTS / SPORTS / MUSIC: Ticketmaster + Claude running in parallel ──────
  // Claude starts immediately alongside Ticketmaster so TM latency doesn't eat
  // into Claude's budget. We use TM result if it has events, else Claude.
  if (category !== 'sightseeing') {
    // Fire Claude immediately (don't wait for TM to finish first)
    const claudePromise: Promise<unknown[] | null> = claudeKey
      ? generateWithClaude(city, country, today, count, page, category, claudeKey).catch(() => null)
      : Promise.resolve(null);

    // Attempt Ticketmaster (fast timeout — Claude is already warming up in parallel)
    if (tmKey) {
      try {
        // Smart radius: if the requested radius returns sparse results, automatically
        // expand server-side so the client always gets a full page of content
        let { events: tmEvents, totalPages } = await fetchTicketmaster(lat, lng, category, page, radius, tmKey);
        if (tmEvents.length < 4 && radius <= 25) {
          const expanded = await fetchTicketmaster(lat, lng, category, page, 75, tmKey).catch(() => ({ events: [], totalPages: 0 }));
          if (expanded.events.length > tmEvents.length) { tmEvents = expanded.events; totalPages = expanded.totalPages; }
        }
        if (tmEvents.length < 4 && radius <= 75) {
          const expanded = await fetchTicketmaster(lat, lng, category, page, 150, tmKey).catch(() => ({ events: [], totalPages: 0 }));
          if (expanded.events.length > tmEvents.length) { tmEvents = expanded.events; totalPages = expanded.totalPages; }
        }

        if (tmEvents.length > 0) {
          // TM has events — enrich with Claude and return real data
          const enrichInput = tmEvents.map(ev => ({
            name: ev.name,
            venue: ev._embedded?.venues?.[0]?.name ?? city,
            date: ev.dates?.start?.localDate ?? today,
            time: ev.dates?.start?.localTime?.slice(0, 5) ?? '',
            genre: ev.classifications?.[0]?.genre?.name ?? ev.classifications?.[0]?.segment?.name ?? 'Event',
            price: ev.priceRanges?.[0]
              ? `${ev.priceRanges[0].currency} ${ev.priceRanges[0].min.toFixed(0)}–${ev.priceRanges[0].max.toFixed(0)}`
              : 'See website',
          }));

          const descriptions = claudeKey
            ? await enrichEventDescriptions(enrichInput, city, claudeKey)
                .catch(() => tmEvents.map(ev => `${ev.name} at ${ev._embedded?.venues?.[0]?.name ?? city}.`))
            : tmEvents.map(ev => `${ev.name} at ${ev._embedded?.venues?.[0]?.name ?? city}.`);

          const posts = tmEvents.map((ev, i) => tmEventToPost(ev, descriptions[i] ?? '', city, country));
          return NextResponse.json({ posts, city, country, source: 'ticketmaster', hasMore: page < totalPages - 1, totalPages }, { headers: NO_CACHE });
        }
        // TM returned 0 → fall through to use claudePromise result
      } catch (err) {
        console.error('[events/ticketmaster]', err);
        // Fall through to use claudePromise result
      }
    }

    // No TM results — use the Claude generation that was already running
    const claudePosts = await claudePromise;
    if (claudePosts && claudePosts.length > 0) {
      return NextResponse.json({ posts: claudePosts, city, country, source: 'claude', hasMore: page < 10 }, { headers: NO_CACHE });
    }
  }

  // ── SIGHTSEEING Claude fallback (if Wikipedia failed above) ───────────────
  if (category === 'sightseeing' && claudeKey) {
    try {
      const posts = await generateWithClaude(city, country, today, count, page, category, claudeKey);
      if (posts.length > 0) {
        return NextResponse.json({ posts, city, country, source: 'claude', hasMore: page < 10 }, { headers: NO_CACHE });
      }
    } catch (err) {
      console.error('[events/sightseeing/claude]', err);
    }
  }

  // ── LAST RESORT: hardcoded templates ─────────────────────────────────────
  return NextResponse.json({
    posts: hardFallback(city, country, page, count),
    city, country, source: 'fallback', hasMore: page < 5,
  }, { headers: NO_CACHE });
}
