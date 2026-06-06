import { NextRequest, NextResponse } from 'next/server';

function logoUrl(domain: string): string {
  return `https://logo.clearbit.com/${domain}`;
}

function fallbackAvatar(name: string): string {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const colors = ['8b5cf6', 'ec4899', '3b82f6', 'f97316', '22c55e', 'f43f5e', 'a855f7', '06b6d4'];
  const color = colors[name.charCodeAt(0) % colors.length];
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${color}&color=fff&size=80&bold=true`;
}

function makeUser(name: string, domain?: string) {
  const slug = (name ?? 'Nova Event').toLowerCase().replace(/[^a-z0-9]/g, '.');
  return {
    id: `org_${slug}`,
    name: name ?? 'Nova Event',
    username: slug,
    avatar: domain ? logoUrl(domain) : fallbackAvatar(name ?? 'N'),
    bio: `Official Nova partner — ${name}`,
    followers: Math.floor(Math.random() * 5000000) + 10000,
    following: 0,
    posts: Math.floor(Math.random() * 50000) + 100,
    verified: true,
  };
}

function imageUrl(seed: string): string {
  const clean = seed.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 32);
  return `https://picsum.photos/seed/${clean}/600/750`;
}

function fallbackEvents(city: string, country: string, offset: number, category?: string) {
  const allTemplates = [
    { title: `Live Music Night`, cat: 'music', domain: 'ra.co', price: '€12–€25', desc: `An unmissable night of live bands and electronic sets right in the heart of ${city}. Expect three stages, craft bars, street food, and a crowd that lives for music.` },
    { title: `${city} Street Food Festival`, cat: 'food', domain: 'streetfoodfestival.com', price: 'Free entry', desc: `Over 60 vendors bring the world's cuisines to one location in ${city}. Ramen, tacos, gelato, jerk chicken — plus cooking demos and a cocktail garden.` },
    { title: `Contemporary Art Fair`, cat: 'art', domain: 'artfair.com', price: '€18 / Students €9', desc: `150 galleries from 30 countries descend on ${city} for the season's biggest art fair. Discover emerging artists, attend curator talks, acquire works directly from studios.` },
    { title: `Tech Meetup — AI & Startups`, cat: 'tech', domain: 'meetup.com', price: 'Free', desc: `300+ founders, developers, and investors gather for an evening of lightning talks, demos, and genuine connection. The most energetic tech community event in ${city}.` },
    { title: `Sunrise Yoga in the Park`, cat: 'fitness', domain: 'classpass.com', price: '€8', desc: `Guided 90-minute sunrise yoga in ${city}'s most scenic park. Certified instructors, all levels welcome, mats provided. Start your weekend the right way.` },
    { title: `${city} Night Market`, cat: 'lifestyle', domain: 'eventbrite.com', price: 'Free', desc: `200 stalls of vintage clothing, handmade crafts, vinyl records, artisan food, and local produce fill ${city}'s streets every weekend. Live music all evening.` },
    { title: `Open-Air Cinema`, cat: 'lifestyle', domain: 'timeout.com', price: '€12', desc: `Award-winning films under the stars at ${city}'s iconic outdoor cinema. Deckchairs, blankets, street food trucks, and a programme spanning classics to new releases.` },
    { title: `${city} Half Marathon`, cat: 'fitness', domain: 'active.com', price: '€25', desc: `Lace up and join thousands of runners through the scenic streets of ${city}. PB chasers and first-timers both welcome — post-race celebration and medals for all finishers.` },
    { title: `Underground Techno Night`, cat: 'music', domain: 'ra.co', price: '€15', desc: `${city}'s most respected underground club presents a night of techno and house across two rooms. International headliners, doors at 22:00, immersive light production.` },
    { title: `Vintage & Thrift Fair`, cat: 'fashion', domain: 'depop.com', price: 'Free entry', desc: `The city's best vintage dealers bring curated pre-loved fashion from the 60s to Y2K. Perfect for sustainable shoppers, collectors, and anyone who loves a bargain.` },
    // Sightseeing fallbacks
    { title: `${city} Old Town Walking Tour`, cat: 'sightseeing', domain: 'getyourguide.com', price: 'Free / Tips welcome', desc: `Explore the centuries-old streets of ${city}'s historic old town with a passionate local guide. Hidden courtyards, architectural gems, and the stories behind every building.` },
    { title: `${city} Cathedral & Museum Pass`, cat: 'sightseeing', domain: 'museumpass.com', price: '€22 · 48h unlimited access', desc: `One pass, access to 12 of ${city}'s top cultural landmarks. Skip the queues at the cathedral, national museum, gallery of art, and historic palace — all included.` },
    { title: `Sunset Panorama Tour`, cat: 'sightseeing', domain: 'viator.com', price: '€18/person', desc: `End your day at ${city}'s highest viewing platform. A guided 90-minute sunset experience with a local expert revealing the city's skyline secrets from 180m above street level.` },
    { title: `River Boat Sightseeing Cruise`, cat: 'sightseeing', domain: 'viator.com', price: '€24/person', desc: `See ${city} from the water on a 2-hour guided cruise past the city's most iconic landmarks. Audio commentary in 8 languages, open deck, and a bar on board.` },
    // Sports fallbacks
    { title: `${city} FC Home Match`, cat: 'sports', domain: 'seatgeek.com', price: 'From €15', desc: `Catch the home side in action at their iconic stadium in ${city}. An electric atmosphere guaranteed — bring the family, grab a matchday programme, and experience live football at its best.` },
    { title: `City Run Club — Weekly 5K`, cat: 'sports', domain: 'strava.com', price: 'Free', desc: `Join hundreds of runners every Saturday morning for a social 5K through ${city}'s most scenic routes. All paces welcome, coffee and stretching session after every run.` },
    { title: `${city} Tennis Open`, cat: 'sports', domain: 'atptour.com', price: 'From €25', desc: `World-class tennis returns to ${city} for a week of ATP/WTA competition. Courtside seats available, outdoor fan zones, and a chance to watch tomorrow's champions today.` },
  ];

  const templates = category
    ? allTemplates.filter(t => t.cat === category)
    : allTemplates.filter(t => !['sightseeing'].includes(t.cat));

  const pool = templates.length > 0 ? templates : allTemplates;
  const now = Date.now();

  return pool.map((t, i) => {
    const daysAhead = ((offset + i) % 28) + 1;
    const eventDate = new Date(now + daysAhead * 86400000);
    const dateStr = eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const rawDate = eventDate.toISOString().split('T')[0];
    const user = makeUser(t.title, t.domain);
    const seed = `${city}_${t.cat}_${offset}_${i}`;
    return {
      id: `ai_ev_${seed}`,
      user,
      image: imageUrl(seed),
      caption: `${t.desc}\n\n📅 ${dateStr}, 19:00\n📍 ${city}, ${country}\n🎟️ ${t.price}\n🔗 More info & tickets: https://${t.domain}`,
      likes: Math.floor(Math.random() * 12000) + 500,
      comments: Math.floor(Math.random() * 400) + 20,
      category: t.cat,
      hashtags: [`#${city.replace(/\s/g, '')}`, `#${t.cat}`, '#nova', '#events', '#local'],
      timestamp: now - Math.random() * 10800000,
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

function buildPrompt(city: string, country: string, today: string, count: number, offset: number, category?: string): string {
  const catGuidance: Record<string, string> = {
    sightseeing: `Focus EXCLUSIVELY on sightseeing: landmarks, museums, galleries, historic sites, architectural tours, viewpoints, UNESCO sites, guided tours, palace visits, cathedral entries, river cruises, and cultural experiences. Each must have a specific named venue or attraction in ${city}.`,
    sports: `Focus EXCLUSIVELY on sports events: football/soccer matches, athletics, tennis, basketball, cycling races, swimming competitions, martial arts, rugby, hockey, motorsport. Include both spectator events and participatory events (fun runs, amateur leagues, fitness classes).`,
    events: `Focus on ticketed events and nightlife: concerts, festival days, comedy shows, theatre, opera, club nights, pop-up markets, seasonal fairs, food festivals, cultural celebrations.`,
    fitness: `Focus on fitness and wellness: outdoor workout classes, yoga sessions, running clubs, cycling events, gym open days, sports classes, hiking groups, wellness retreats.`,
    food: `Focus on food and drink experiences: restaurant weeks, food festivals, pop-up dining, wine tastings, cooking masterclasses, street food markets, chef's tables, food tours.`,
    music: `Focus on music events: live concerts, club nights, jazz evenings, open mic nights, DJ sets, music festivals, vinyl fairs, band showcases.`,
    art: `Focus on art and culture: gallery openings, museum exhibitions, street art tours, art fairs, photography exhibits, sculpture parks, artist talks, cultural festivals.`,
  };

  const guidance = catGuidance[category ?? ''] ?? `Mix event types: concerts, gallery openings, food festivals, markets, meetups, sports, yoga, museum exhibits, comedy, cinema, pop-up shops, vintage fairs, cultural festivals.`;

  return `You are a hyper-local discovery engine for Nova, an AI-powered social app.

Generate exactly ${count} unique upcoming real-world experiences in ${city}, ${country}. Today is ${today}.

Category guidance: ${guidance}

Rules:
- Each entry must feel genuinely local to ${city} — use real neighbourhood names, known venue types, local culture
- Organisers must be real companies, venues, brands, or established local organisations
- Skip the first ${offset} most obvious results to ensure variety across pages
- All dates must be within the next 45 days from ${today}
- Include a realistic website URL for tickets or information

For each entry provide this exact JSON structure:
{
  "title": "specific descriptive title",
  "organizer": "real company or organisation name",
  "website": "organizer's real domain (e.g. 'timeout.com', 'getyourguide.com')",
  "venue": "specific venue name in ${city}",
  "address": "street address or district",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "endTime": "HH:MM",
  "price": "exact price or 'Free'",
  "description": "4 vivid sentences: what it is, who's involved, what the experience feels like, why it's unmissable",
  "url": "real-looking official URL for tickets/info",
  "category": "${category ?? 'events'}",
  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"],
  "imageQuery": "3-word descriptive photo search query"
}

Respond ONLY with a valid JSON array. No markdown, no explanation.`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const city     = searchParams.get('city')     || 'Vienna';
  const country  = searchParams.get('country')  || 'Austria';
  const lat      = searchParams.get('lat')      || '48.2082';
  const lng      = searchParams.get('lng')      || '16.3738';
  const offset   = parseInt(searchParams.get('offset') || '0', 10);
  const count    = parseInt(searchParams.get('count')  || '8', 10);
  const category = searchParams.get('category') || undefined;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      posts: fallbackEvents(city, country, offset, category).slice(0, count),
      city, country, source: 'fallback',
    });
  }

  const today = new Date().toISOString().split('T')[0];
  const prompt = buildPrompt(city, country, today, count, offset, category);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 7000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic ${res.status}`);

    const data = await res.json();
    const text: string = data.content?.[0]?.text ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array');

    const events: Record<string, unknown>[] = JSON.parse(jsonMatch[0]);
    const now = Date.now();

    const posts = events.map((ev, i) => {
      const title     = String(ev.title ?? `Event ${i + 1}`);
      const organizer = String(ev.organizer ?? title);
      const website   = String(ev.website ?? '');
      const venue     = String(ev.venue ?? city);
      const address   = String(ev.address ?? '');
      const date      = String(ev.date ?? '');
      const time      = String(ev.time ?? '19:00');
      const endTime   = String(ev.endTime ?? '');
      const price     = String(ev.price ?? 'See website');
      const desc      = String(ev.description ?? '');
      const url       = String(ev.url ?? '#');
      const cat       = String(ev.category ?? category ?? 'events');
      const hashtags  = Array.isArray(ev.hashtags) ? ev.hashtags as string[] : [`#${city}`, '#events'];
      const imgQuery  = String(ev.imageQuery ?? `${cat} ${city}`);

      const user = makeUser(organizer, website || undefined);
      const seed = `${city}_${offset}_${i}_${title.slice(0, 8)}`.replace(/\s/g, '_');

      let eventDateStr = 'Date TBC';
      if (date) {
        try {
          eventDateStr = new Date(`${date}T${time}:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        } catch { /* ignore */ }
      }

      return {
        id: `ai_${seed}_${Date.now() + i}`,
        user,
        image: imageUrl(imgQuery),
        caption: `${desc}\n\n📅 ${eventDateStr}${time ? ` · ${time}` : ''}${endTime ? `–${endTime}` : ''}\n📍 ${venue}${address ? `, ${address}` : ''}\n🎟️ ${price}\n🔗 More info & tickets: ${url}`,
        likes: Math.floor(Math.random() * 15000) + 500,
        comments: Math.floor(Math.random() * 600) + 30,
        category: cat,
        hashtags,
        timestamp: now - Math.random() * 14400000,
        location: { name: `${venue}, ${city}`, lat: parseFloat(lat), lng: parseFloat(lng) },
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

    return NextResponse.json({ posts, city, country, source: 'ai' });
  } catch (err) {
    console.error('[events/route]', err);
    return NextResponse.json({
      posts: fallbackEvents(city, country, offset, category).slice(0, count),
      city, country, source: 'fallback',
    });
  }
}
