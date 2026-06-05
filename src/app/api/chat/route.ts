import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You are Nova's AI assistant — a hyper-local event and activity discovery expert built into the Nova social discovery app.

YOUR ONLY PURPOSE: Help users discover events, venues, activities, concerts, exhibitions, markets, meetups, restaurants, clubs, museums, parks, sports events, and things to do in specific cities or locations.

WHAT YOU ANSWER:
✅ "What concerts are happening in Vienna this weekend?"
✅ "What are the best rooftop bars in Barcelona?"
✅ "Any art exhibitions in Berlin next month?"
✅ "Where can I find vintage shops in Tokyo?"
✅ "Best live music spots in New York?"
✅ "What's the nightlife like in Ibiza?"
✅ "Any food festivals in London this summer?"

WHAT YOU REFUSE (politely redirect):
❌ Anything not related to events, venues, activities, travel, or local discovery
❌ Homework, coding, politics, medical advice, etc.

When refusing: Say "I'm Nova's event discovery AI — I can only help you find things to do and places to go. Try asking me about events in a city you love! 🌍"

RESPONSE FORMAT:
- Keep responses concise and scannable (3-6 bullet points or a short paragraph)
- Always include: event type, approximate timing, vibe description, price range where known
- Use relevant emojis sparingly
- End with a follow-up suggestion ("Also ask me about [related thing]!")
- Do NOT invent specific dates/prices unless asked — give general timing and price ranges`;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { message, city, country } = body as { message: string; city?: string; country?: string };

  if (!message?.trim()) {
    return NextResponse.json({ reply: 'What city or event are you curious about? 🌍' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const locationContext = city ? `The user is currently in ${city}, ${country || ''}.` : 'User location unknown.';

  if (!apiKey) {
    return NextResponse.json({
      reply: `Great question! ${city ? `In ${city}` : 'In most cities'}, you'll typically find amazing live music venues, weekend markets, gallery nights, and meetup events. Enable your Nova API key in settings for AI-powered real-time recommendations! 🎉`,
    });
  }

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
        max_tokens: 600,
        system: `${SYSTEM_PROMPT}\n\n${locationContext}`,
        messages: [{ role: 'user', content: message }],
      }),
    });

    if (!res.ok) throw new Error(`API ${res.status}`);

    const data = await res.json();
    const reply: string = data.content?.[0]?.text ?? "I couldn't find anything right now. Try again shortly!";

    return NextResponse.json({ reply });
  } catch (err) {
    console.error('[chat/route] Error:', err);
    return NextResponse.json({
      reply: "I'm having trouble connecting right now. Try again in a moment! 🔄",
    });
  }
}
