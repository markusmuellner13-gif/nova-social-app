// Claude-powered enrichment and web search — only used when an
// ANTHROPIC_API_KEY with credits is configured. Everything else in the feed
// works without it.

import { ApiPost, makeUser, fetchOgImage, proxyImage } from './shared';
import { upstreamPaused, pauseUpstream, retryAfterSeconds } from '@/lib/sourceBreaker';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

// ── The breaker ──────────────────────────────────────────────────────────────
// Between Sept 11 and 13 every Claude call in production failed with "Your
// credit balance is too low to access the Anthropic API". The feed's fallbacks
// did their job, so nothing broke for users — but each doomed call still burned
// up to 25 seconds inside a 60-second function, and the ingest cron makes a lot
// of them. An empty account cannot be retried into a full one, so once Anthropic
// says so we stop asking for a while.
const BREAKER = 'anthropic';

// How long to stay away, by what went wrong. Billing and auth are human
// problems, so we check back rarely — but not so rarely that a top-up takes
// hours to take effect. Throttling and overload are the API's own transients.
const PAUSE_BILLING_S   = 15 * 60;   // out of credit / plan limit — a top-up fixes it
const PAUSE_AUTH_S      = 30 * 60;   // bad or revoked key — a redeploy fixes it
const PAUSE_RATELIMIT_S = 60;        // 429 without a Retry-After
const PAUSE_OVERLOAD_S  = 30;        // 529 — Anthropic is busy

/**
 * Thrown instead of calling Anthropic while the breaker is open. Callers already
 * treat any Claude failure as "use the free sources", so this needs no special
 * handling — it just arrives instantly instead of 25 seconds later.
 */
export class ClaudeUnavailableError extends Error {
  constructor(reason = 'Anthropic paused by circuit breaker') {
    super(reason);
    this.name = 'ClaudeUnavailableError';
  }
}

/**
 * Whether a Claude call is worth attempting right now. Call this before the
 * *expensive* paths (web search) so they can skip the work — and the spend
 * budget — entirely. `callClaude` enforces it regardless.
 */
export async function claudeAvailable(): Promise<boolean> {
  return !(await upstreamPaused(BREAKER));
}

// Classify an Anthropic error response into "how long should we stay away".
// Returns null for faults that really are one-offs and deserve a plain retry.
function pauseForResponse(status: number, body: string, res: Response): { seconds: number; reason: string } | null {
  const text = body.toLowerCase();

  // 400 + "credit balance is too low" is the one we actually saw. Anthropic
  // returns it as invalid_request_error, so status alone can't identify it.
  if (text.includes('credit balance is too low') || text.includes('billing') || text.includes('insufficient')) {
    return { seconds: PAUSE_BILLING_S, reason: 'out of Anthropic credit — top up at console.anthropic.com → Plans & Billing' };
  }
  if (status === 401 || status === 403) {
    return { seconds: PAUSE_AUTH_S, reason: `ANTHROPIC_API_KEY rejected (HTTP ${status})` };
  }
  if (status === 429) {
    return { seconds: retryAfterSeconds(res) ?? PAUSE_RATELIMIT_S, reason: 'rate limited (HTTP 429)' };
  }
  if (status === 529) {
    return { seconds: PAUSE_OVERLOAD_S, reason: 'Anthropic overloaded (HTTP 529)' };
  }
  return null;
}

async function callClaude(prompt: string, apiKey: string, maxTokens: number, timeoutMs = 7000, tools?: unknown[]): Promise<string> {
  // Fail fast rather than slowly. This is the single change that stops a dead
  // API key from eating the ingest cron's entire time budget.
  if (await upstreamPaused(BREAKER)) throw new ClaudeUnavailableError();

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      ...(tools ? { tools } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const pause = pauseForResponse(res.status, body, res);
    if (pause) await pauseUpstream(BREAKER, pause.seconds, pause.reason);
    throw new Error(`Claude ${res.status}: ${body.slice(0, 400)}`);
  }
  const d = await res.json() as { content?: { type: string; text?: string }[] };
  return d.content?.filter(b => b.type === 'text').map(b => b.text ?? '').join('') ?? '';
}

export async function enrichEventDescriptions(
  items: { name: string; venue: string; date: string; time: string; genre: string; price: string }[],
  city: string, apiKey: string
): Promise<string[]> {
  const prompt = `Write a vivid 3-sentence description for each of these ${items.length} real events in ${city}.
Sentence 1: what the event is and who's performing/involved.
Sentence 2: what makes this specific event unmissable.
Sentence 3: what the atmosphere will feel like in sensory detail.

${items.map((e, i) => `${i + 1}. "${e.name}" at ${e.venue} · ${e.date} ${e.time} · ${e.genre} · ${e.price}`).join('\n')}

Respond ONLY with a JSON array of ${items.length} strings. No markdown.`;

  const text = await callClaude(prompt, apiKey, 2000);
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return items.map(e => `${e.name} at ${e.venue}.`);
  return JSON.parse(match[0]) as string[];
}

export async function enrichPlaceDescriptions(
  places: { name: string; type: string; address: string }[],
  city: string, category: string, apiKey: string
): Promise<string[]> {
  const CAT_LABELS: Record<string, string> = {
    shops:       'second-hand/vintage shop',
    venues:      'venue or entertainment space',
    restaurants: 'restaurant, café or bar',
    food:        'restaurant, café or bar',
    hotels:      'hotel or place to stay',
    rentals:     'rental service (bikes, cars, boats, equipment)',
    outdoors:    'outdoor spot (hike, trail, lake, river, park or viewpoint)',
  };
  const catLabel = CAT_LABELS[category] ?? 'venue or entertainment space';
  const prompt = `Write a punchy 2-sentence description for each of these ${places.length} real ${catLabel}s in ${city} for a social discovery app.
Sentence 1: what makes this place special and worth visiting.
Sentence 2: what the vibe and experience feels like.

${places.map((p, i) => `${i + 1}. "${p.name}" (${p.type}) at ${p.address || city}`).join('\n')}

Respond ONLY with a JSON array of ${places.length} strings. No markdown.`;

  const text = await callClaude(prompt, apiKey, 1500);
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return places.map(p => `${p.name} is a great local ${catLabel} in ${city}.`);
  return JSON.parse(match[0]) as string[];
}

export async function enrichSightseeingDescriptions(
  pois: { name: string; extract: string }[],
  city: string, apiKey: string
): Promise<string[]> {
  const prompt = `Make these ${pois.length} Wikipedia descriptions more vivid and exciting for a social discovery app in ${city}.
Keep all factual details. Rewrite to 3 punchy sentences each: what it is + why it's special + what visiting feels like.

${pois.map((p, i) => `${i + 1}. ${p.name}: "${p.extract?.slice(0, 200) ?? 'A landmark in ' + city}"`).join('\n')}

Respond ONLY with a JSON array of ${pois.length} strings. No markdown.`;

  const text = await callClaude(prompt, apiKey, 2000);
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return pois.map(p => p.extract?.slice(0, 300) ?? `${p.name} is a remarkable landmark in ${city}.`);
  return JSON.parse(match[0]) as string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude + web search — find REAL events when free sources have no coverage
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_GUIDANCE: Record<string, string> = {
  events:      'concerts, club nights, comedy shows, theatre, festivals, pop-up markets, cultural celebrations',
  music:       'concerts, club nights, jazz evenings, open mic nights, DJ sets, music festivals, live bands',
  sports:      'football/soccer matches, athletics, tennis, basketball, cycling, martial arts, fun runs, local league matches',
  fitness:     'outdoor yoga, running clubs, cycling events, gym open days, hiking groups, wellness retreats',
  food:        'restaurant weeks, food festivals, pop-up dining, wine tastings, cooking masterclasses, street food markets',
  art:         'gallery openings, museum exhibitions, street art tours, art fairs, photography exhibits, artist talks',
  sightseeing: 'guided landmark tours, museum timed entries, viewpoint access, historic site visits, river cruises, architectural walks',
  lifestyle:   'night markets, open-air cinema, pop-up boutiques, craft fairs, wellness events, community gatherings',
  discover:    'concerts, food festivals, art openings, sports matches, markets, fitness classes',
  community:   'free community meetups, neighbourhood gatherings, swap meets, volunteer events, local markets, cultural festivals, block parties, language exchanges, community clean-ups',
  travel:      'guided day trips, scenic excursions, walking tours, boat trips, wine region tours, nearby getaway experiences',
  tech:        'tech meetups, hackathons, startup events, coding workshops, developer conferences, maker fairs',
  pets:        'pet adoption days, dog meetups, animal shelter open days, pet expos, dog-friendly events',
  fashion:     'fashion pop-ups, designer markets, vintage sales, fashion shows, style workshops, sample sales',
  restaurants: 'restaurant openings, restaurant weeks, tasting menus, brunch specials, chef events, pop-up dining',
  hotels:      'hotel deals, spa weekends, rooftop bar events, special stay packages, boutique hotel openings',
  rentals:     'bike rental tours, e-scooter offers, boat rental experiences, ski equipment rental deals, car sharing offers',
  outdoors:    'guided hikes, mountain trails, lake swimming spots, river kayaking, cycling routes, nature walks, scenic viewpoints, national park visits',
};

// The web-search call is the slowest thing the app does (it is doing several
// real searches behind the scenes), so the caller has to be able to say how long
// it may take. A cron with 12 seconds left must not start a 25-second call — see
// /api/cron/ingest-towns, where exactly that killed the function at the 60s cap.
export const AI_SEARCH_TIMEOUT_MS = 25_000;
// Below this there is no point starting: the search alone won't have returned.
export const AI_SEARCH_MIN_MS = 10_000;

export async function searchRealEventsWithClaude(
  city: string, country: string, today: string, count: number, page: number, category: string, apiKey: string,
  userLat?: number, userLng?: number, tourismFocus = false, timeoutMs = AI_SEARCH_TIMEOUT_MS
): Promise<ApiPost[]> {
  const guidance = CATEGORY_GUIDANCE[category] ?? CATEGORY_GUIDANCE.events;

  const tourismInstructions = tourismFocus
    ? `Search SPECIFICALLY on the official tourism websites and event calendars for ${city}:
- Search "${city} official tourism website events" and "${city} tourismus veranstaltungen" (use the local language of ${country} too)
- Check the city's official website event calendar and the regional tourism board for ${city}
- Focus on what locals and tourism boards promote: festivals, seasonal celebrations, wine/food festivals, open-air concerts, christmas/easter markets, city fairs, spa & culture events
These tourism-board events are often missing from ticket platforms — they are exactly what we want.`
    : `Good sources: the official ${city} tourism website and city event calendar (search in the local language of ${country} too, e.g. "veranstaltungen", "eventos", "événements"), Eventbrite, local newspapers, venue websites.`;

  const prompt = `Search the web for ${count} REAL upcoming events in ${city}, ${country} happening after ${today}.

Search for: ${guidance}

${tourismInstructions}

${page > 0 ? `Page ${page + 1}: find different events from earlier results — search for less obvious/mainstream options.` : ''}

For each real event you find, extract the exact details from the real event pages. Return ONLY a valid JSON array of ${count} objects:
[{
  "title": "exact real event name",
  "organizer": "exact organiser or promoter name",
  "website": "domain of the ticket or event site (e.g. 'eventbrite.com')",
  "venue": "exact venue name in ${city}",
  "address": "street address or district in ${city}",
  "date": "YYYY-MM-DD (within next 60 days)",
  "time": "HH:MM or empty string if unknown",
  "price": "exact price from the event page, or Free",
  "description": "2-3 sentences about this specific real event",
  "url": "exact URL to buy tickets or find info",
  "category": "${category}",
  "hashtags": ["#tag1","#tag2","#tag3","#tag4"]
}]

IMPORTANT: Only include events you confirmed exist via web search. Do not invent events.
Return only the raw JSON array, no markdown, no extra text.`;

  const text = await callClaude(prompt, apiKey, 8000, timeoutMs,
    [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }]);
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  const events = JSON.parse(match[0]) as Record<string, unknown>[];
  const now = Date.now();

  return Promise.all(events.map(async (ev, i) => {
    const title    = String(ev.title ?? `Event ${i + 1}`);
    const org      = String(ev.organizer ?? title);
    const website  = String(ev.website ?? '');
    const venue    = String(ev.venue ?? city);
    const address  = String(ev.address ?? '');
    const date     = String(ev.date ?? '');
    const time     = String(ev.time ?? '');
    const price    = String(ev.price ?? 'See website');
    const desc     = String(ev.description ?? '');
    const url      = String(ev.url ?? '#');
    const cat      = String(ev.category ?? category);
    const tags     = Array.isArray(ev.hashtags) ? ev.hashtags as string[] : [`#${city}`, '#events'];

    let eventDateStr = 'Date TBC';
    if (date) { try { eventDateStr = new Date(`${date}T${time || '00:00'}:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch { /* ignore */ } }

    // The event's OWN poster, taken from the page Claude cited (og:image is what
    // that page hands social crawlers, so it is the real artwork for this
    // event). Previously this asked a stock library for the model's suggested
    // `imageQuery` — a category-shaped phrase like "jazz concert night", which
    // is precisely how two unrelated gigs ended up on the same photograph.
    // No poster found → no photo.
    const pageUrl = /^https?:\/\//.test(url) ? url : (/^https?:\/\//.test(website) ? website : '');
    const og = pageUrl ? await fetchOgImage(pageUrl, 4000) : null;
    const image = og ? proxyImage(og) : '';

    return {
      id: `${tourismFocus ? 'tour' : 'ws'}_${city}_p${page}_${i}_${Date.now()}`,
      user: makeUser(org, website || undefined),
      image,
      caption: `${desc}\n\n📅 ${eventDateStr}${time ? ` · ${time}` : ''}\n📍 ${venue}${address ? `, ${address}` : ''}\n🎟️ ${price}\n🔗 Tickets & info: ${url}`,
      likes: 0,
      comments: 0,
      category: cat,
      hashtags: tags,
      timestamp: now - Math.random() * 10_800_000,
      location: { name: `${venue}, ${city}`, lat: userLat ?? 0, lng: userLng ?? 0 },
      saved: false, liked: false,
      isEvent: true, isAIGenerated: false,
      eventDate: `${eventDateStr}${time ? ` · ${time}` : ''}`,
      eventDateRaw: date || null,
      eventVenue: `${venue}${address ? `, ${address}` : ''}`,
      eventUrl: url,
      organizer: org,
      price,
    };
  }));
}
