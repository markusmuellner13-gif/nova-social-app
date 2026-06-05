import { NextRequest, NextResponse } from 'next/server';

// Build a Clearbit logo URL from a domain. Client handles onError fallback.
function logoUrl(domain: string): string {
  return `https://logo.clearbit.com/${domain}`;
}

// Gradient avatar fallback for unknown organisations
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

function fallbackEvents(city: string, country: string, offset: number) {
  const templates = [
    { title: `Live Music Night`, cat: 'music', domain: 'ra.co',        price: '€12–€25',    desc: `An unmissable night of live bands and electronic sets right in the heart of ${city}. Expect three stages, craft bars, street food, and a crowd that lives for music.` },
    { title: `${city} Street Food Festival`, cat: 'food', domain: 'streetfoodfestival.com', price: 'Free entry', desc: `Over 60 vendors bring the world's cuisines to one location in ${city}. Ramen, tacos, gelato, jerk chicken — plus cooking demos and a cocktail garden.` },
    { title: `Contemporary Art Fair`, cat: 'art', domain: 'artfair.com', price: '€18 / Students €9', desc: `150 galleries from 30 countries descend on ${city} for the season's biggest art fair. Discover emerging artists, attend curator talks, acquire works directly from studios.` },
    { title: `Tech Meetup — AI & Startups`, cat: 'tech', domain: 'meetup.com', price: 'Free', desc: `300+ founders, developers, and investors gather for an evening of lightning talks, demos, and genuine connection. The most energetic tech community event in ${city}.` },
    { title: `Sunrise Yoga in the Park`, cat: 'fitness', domain: 'classpass.com', price: '€8', desc: `Guided 90-minute sunrise yoga in ${city}'s most scenic park. Certified instructors, all levels welcome, mats provided. Start your weekend the right way.` },
    { title: `${city} Night Market`, cat: 'lifestyle', domain: 'eventbrite.com', price: 'Free', desc: `200 stalls of vintage clothing, handmade crafts, vinyl records, artisan food, and local produce fill ${city}'s streets every weekend. Live music all evening.` },
    { title: `Open-Air Cinema`, cat: 'lifestyle', domain: 'timeout.com', price: '€12', desc: `Award-winning films under the stars at ${city}'s iconic outdoor cinema. Deckchairs, blankets, street food trucks, and a programme spanning classics to new releases.` },
    { title: `${city} Half Marathon`, cat: 'fitness', domain: 'active.com', price: '€25', desc: `Lace up and join thousands of runners through the scenic streets of ${city}. PB chasers and first-timers both welcome — post-race celebration and medals for all finishers.` },
    { title: `Underground Techno Night`, cat: 'music', domain: 'ra.co', price: '€15', desc: `${city}'s most respected underground club presents a night of techno and house across two rooms. International headliners, doors at 22:00, immersive light production.` },
    { title: `Vintage & Thrift Fair`, cat: 'fashion', domain: 'depop.com', price: 'Free entry', desc: `The city's best vintage dealers bring curated pre-loved fashion from the 60s to Y2K. Perfect for sustainable shoppers, collectors, and anyone who loves a bargain.` },
  ];

  const now = Date.now();
  return templates.map((t, i) => {
    const daysAhead = ((offset + i) % 28) + 1;
    const eventDate = new Date(now + daysAhead * 86400000);
    const dateStr = eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
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
      eventVenue: city,
      eventUrl: `https://${t.domain}`,
      organizer: t.title,
      price: t.price,
    };
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const city    = searchParams.get('city')    || 'Vienna';
  const country = searchParams.get('country') || 'Austria';
  const lat     = searchParams.get('lat')     || '48.2082';
  const lng     = searchParams.get('lng')     || '16.3738';
  const offset  = parseInt(searchParams.get('offset') || '0', 10);
  const count   = parseInt(searchParams.get('count')  || '8',  10);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      posts: fallbackEvents(city, country, offset).slice(0, count),
      city, country, source: 'fallback',
    });
  }

  const today = new Date().toISOString().split('T')[0];

  const prompt = `You are a hyper-local event discovery engine for Nova, an AI-powered social discovery app.

Generate exactly ${count} unique upcoming real-world events in ${city}, ${country}. Today is ${today}.

Rules:
- Mix event types: concerts, club nights, gallery openings, food festivals, markets, meetups, sports, yoga/fitness, museum exhibits, comedy, cinema, pop-up shops, vintage fairs, cultural festivals
- Each event must feel genuinely local to ${city} — use real neighbourhood names, known venue types, local culture
- Organisers must be real companies, venues, brands, or established local organisations (NOT individuals)
- Skip the first ${offset} most obvious events to ensure variety each request

For each event provide:
{
  "title": "specific event title",
  "organizer": "real company or organisation name (e.g. 'Wiener Philharmoniker', 'Berghain', 'Time Out ${city}', 'Nike Training Club')",
  "website": "organizer's real domain (e.g. 'wienerphilharmoniker.at', 'timeout.com', 'nike.com') — used to fetch their logo",
  "venue": "specific venue name in ${city}",
  "address": "street address",
  "date": "YYYY-MM-DD (next 45 days from ${today})",
  "time": "HH:MM",
  "endTime": "HH:MM",
  "price": "exact price or Free",
  "description": "4 vivid sentences: what it is, who's involved, what the experience feels like, why it's unmissable",
  "url": "real-looking official URL for tickets/info",
  "category": "travel|food|fashion|sports|art|tech|fitness|music|pets|lifestyle|events",
  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"],
  "imageQuery": "3-word photo search query"
}

Respond ONLY with a valid JSON array. No markdown, no explanation.`;

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
      const category  = String(ev.category ?? 'events');
      const hashtags  = Array.isArray(ev.hashtags) ? ev.hashtags as string[] : [`#${city}`, '#events'];
      const imgQuery  = String(ev.imageQuery ?? `${category} ${city}`);

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
        category,
        hashtags,
        timestamp: now - Math.random() * 14400000,
        location: { name: `${venue}, ${city}`, lat: parseFloat(lat), lng: parseFloat(lng) },
        saved: false, liked: false,
        isEvent: true, isAIGenerated: true,
        eventDate: `${eventDateStr}${time ? ` · ${time}` : ''}`,
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
      posts: fallbackEvents(city, country, offset).slice(0, count),
      city, country, source: 'fallback',
    });
  }
}
