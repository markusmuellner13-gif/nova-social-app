import { NextRequest, NextResponse } from 'next/server';

const NOVA_AI_USER = {
  id: 'nova_ai',
  name: 'Nova AI',
  username: 'nova.discover',
  avatar: 'https://i.pravatar.cc/150?img=70',
  bio: '🤖 AI-powered local event discovery',
  followers: 0,
  following: 0,
  posts: 0,
  verified: true,
};

function imageUrl(seed: string): string {
  const clean = seed.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
  return `https://picsum.photos/seed/${clean}/600/750`;
}

function fallbackEvents(city: string, country: string, offset: number) {
  const base = [
    { title: `Live Music Night in ${city}`, category: 'music', desc: `A night of live performances from local and international artists at the heart of ${city}. Featuring three stages, street food, and an electric atmosphere that runs until the early hours.`, price: '€12–€28', url: `https://eventbrite.com/e/live-music-${city.toLowerCase().replace(/\s/g,'-')}` },
    { title: `${city} Street Food Festival`, category: 'food', desc: `Over 60 vendors bring the world's cuisines to ${city} for one incredible weekend. From ramen to tacos, gelato to jerk chicken — plus cooking demos, cocktail bars, and live DJ sets.`, price: 'Free entry', url: `https://streetfoodfestival.com/${city.toLowerCase().replace(/\s/g,'-')}` },
    { title: `Contemporary Art Fair ${city}`, category: 'art', desc: `150 galleries from 30 countries converge on ${city} for the biggest art fair of the season. Discover emerging artists, attend curator talks, and acquire works directly from the studios.`, price: '€18 / Students €9', url: `https://artfair${city.toLowerCase().replace(/\s/g,'')}.com` },
    { title: `${city} Tech Meetup — AI & Future of Work`, category: 'tech', desc: `Join 400+ developers, designers, and founders for talks on AI, product strategy, and the future of distributed teams. Lightning talks, networking, and a demo stage featuring local startups.`, price: 'Free', url: `https://meetup.com/tech-${city.toLowerCase().replace(/\s/g,'-')}` },
    { title: `Outdoor Yoga & Wellness Morning`, category: 'fitness', desc: `Start your Sunday right with a 90-minute sunrise yoga session in ${city}'s most beautiful park. Guided by certified instructors, open to all levels. Mats provided, bring water and an open mind.`, price: '€8', url: `https://yogamorning${city.toLowerCase().replace(/\s/g,'')}.com` },
    { title: `${city} Night Market`, category: 'lifestyle', desc: `The beloved ${city} night market returns with 200 stalls of vintage clothing, handmade crafts, vinyl records, artisan candles, and local produce. Live music every hour.`, price: 'Free', url: `https://nightmarket${city.toLowerCase().replace(/\s/g,'')}.com` },
    { title: `International Film Screening — ${city} Cinémathèque`, category: 'art', desc: `A curated selection of award-winning shorts and feature films from this year's international festival circuit, introduced by local directors. Q&A sessions after each screening.`, price: '€10', url: `https://cinematheque${city.toLowerCase().replace(/\s/g,'')}.com` },
    { title: `${city} Half Marathon — Community Run`, category: 'fitness', desc: `Lace up and join thousands of runners through the scenic streets of ${city}. Whether you're chasing a PB or your first finish line, this community race welcomes everyone. Post-race celebration included.`, price: '€25 registration', url: `https://halfmarathon${city.toLowerCase().replace(/\s/g,'')}.com` },
    { title: `DJ Night: Techno & Electronic at Club Nova`, category: 'music', desc: `${city}'s most iconic underground club opens its doors for a night of techno, house, and electronic music. Three rooms, resident DJs plus two international headliners, doors open at 22:00.`, price: '€15 / Members free', url: `https://clubnova${city.toLowerCase().replace(/\s/g,'')}.com` },
    { title: `${city} Vintage & Thrift Pop-Up Fair`, category: 'fashion', desc: `The city's best vintage dealers bring curated rails of pre-loved fashion from the 60s through to Y2K. Perfect for sustainable shoppers, collectors, and anyone who loves a good find.`, price: 'Free entry', url: `https://vintagefair${city.toLowerCase().replace(/\s/g,'')}.com` },
  ];

  const now = Date.now();
  return base.map((e, i) => {
    const daysAhead = ((offset + i) % 30) + 1;
    const eventDate = new Date(now + daysAhead * 86400000);
    const seed = `${city}_${e.category}_${offset}_${i}`;
    return {
      id: `ai_ev_${seed}`,
      user: NOVA_AI_USER,
      image: imageUrl(seed),
      caption: `${e.desc}\n\n📅 ${eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}, 19:00\n📍 ${city}, ${country}\n🎟️ ${e.price}\n🔗 More info & tickets: ${e.url}`,
      likes: Math.floor(Math.random() * 8000) + 200,
      comments: Math.floor(Math.random() * 300) + 20,
      category: e.category as 'music' | 'food' | 'art' | 'tech' | 'fitness' | 'lifestyle' | 'fashion' | 'events',
      hashtags: [`#${city.replace(/\s/g,'')}`, `#${e.category}`, '#nova', '#events', '#local'],
      timestamp: now - Math.random() * 7200000,
      location: { name: `${city}, ${country}`, lat: 0, lng: 0 },
      saved: false,
      liked: false,
      isEvent: true,
      isAIGenerated: true,
      eventDate: eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      eventVenue: city,
      eventUrl: e.url,
      organizer: `Nova Events ${city}`,
      price: e.price,
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
      city,
      country,
      source: 'fallback',
    });
  }

  const today = new Date().toISOString().split('T')[0];
  const prompt = `You are a hyper-local event discovery engine for Nova, a social discovery app.

Generate exactly ${count} unique, realistic upcoming events happening in ${city}, ${country} within the next 45 days. Today is ${today}.

VARIETY REQUIRED — include a mix of: live music concerts, art gallery openings, food festivals, street markets, club nights, tech meetups, outdoor fitness events, community meetups, sports events, cultural festivals, cinema screenings, museum exhibits, pop-up shops, thrift/vintage fairs, comedy nights, yoga/wellness classes.

For EACH event provide richly detailed, specific information a local would recognise as real:

{
  "title": "specific event title",
  "organizer": "real-sounding organiser name",
  "venue": "specific venue name",
  "address": "street address in ${city}",
  "date": "YYYY-MM-DD (within next 45 days from ${today})",
  "time": "HH:MM",
  "endTime": "HH:MM",
  "price": "specific price or Free",
  "description": "3-4 sentence vivid description: who's performing/speaking/selling, what the vibe is, what attendees will experience, what makes it unmissable",
  "url": "realistic official URL (use real domain patterns like eventbrite.com/e/slug, venue-name.com, or org-name.com)",
  "category": "one of: travel|food|fashion|sports|art|tech|fitness|music|pets|lifestyle|events",
  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"],
  "imageQuery": "2-3 word search query for a relevant photo"
}

IMPORTANT: Vary events by skipping the first ${offset} most obvious events — generate different ones each call.
Respond ONLY with a valid JSON array. No explanation, no markdown.`;

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
        max_tokens: 6000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API ${res.status}`);
    }

    const data = await res.json();
    const text: string = data.content?.[0]?.text ?? '';

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');

    const events: Record<string, string>[] = JSON.parse(jsonMatch[0]);
    const now = Date.now();

    const posts = events.map((ev, i) => {
      const seed = `${city}_${offset}_${i}_${ev.title?.slice(0,10) ?? i}`.replace(/\s/g, '_');
      const dateTs = ev.date ? new Date(`${ev.date}T${ev.time || '19:00'}:00`).getTime() : now + 86400000 * (i + 1);
      const eventDateStr = ev.date
        ? new Date(`${ev.date}T${ev.time || '19:00'}:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : 'Date TBC';

      return {
        id: `ai_${seed}_${Date.now()}`,
        user: NOVA_AI_USER,
        image: imageUrl(ev.imageQuery || ev.title || seed),
        caption: `${ev.description || ''}\n\n📅 ${eventDateStr}${ev.time ? ` at ${ev.time}` : ''}${ev.endTime ? `–${ev.endTime}` : ''}\n📍 ${ev.venue || city}${ev.address ? `, ${ev.address}` : ''}\n🎟️ ${ev.price || 'See website'}\n🔗 More info & tickets: ${ev.url || '#'}`,
        likes: Math.floor(Math.random() * 12000) + 500,
        comments: Math.floor(Math.random() * 500) + 30,
        category: (ev.category as string) || 'events',
        hashtags: (ev.hashtags as unknown as string[]) || [`#${city}`, '#events', '#nova'],
        timestamp: now - Math.random() * 14400000,
        location: {
          name: `${ev.venue || city}, ${city}`,
          lat: parseFloat(lat),
          lng: parseFloat(lng),
        },
        saved: false,
        liked: false,
        isEvent: true,
        isAIGenerated: true,
        eventDate: `${eventDateStr}${ev.time ? ` · ${ev.time}` : ''}`,
        eventVenue: `${ev.venue || city}${ev.address ? `, ${ev.address}` : ''}`,
        eventUrl: ev.url || null,
        organizer: ev.organizer || `Nova ${city}`,
        price: ev.price || 'See website',
      };
    });

    return NextResponse.json({ posts, city, country, source: 'ai' });
  } catch (err) {
    console.error('[events/route] Error:', err);
    return NextResponse.json({
      posts: fallbackEvents(city, country, offset).slice(0, count),
      city,
      country,
      source: 'fallback',
    });
  }
}
