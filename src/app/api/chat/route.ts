import { NextRequest, NextResponse } from 'next/server';
import { answerLocally } from '@/lib/novaBrain';
import { resolveRequestGeo } from '@/lib/sources/geocode';

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

// Hard caps — prevent abuse of the (paid) Anthropic key via oversized prompts.
const MAX_MESSAGE_LEN = 1000;
const MAX_CITY_LEN    = 80;

export async function POST(request: NextRequest) {
  let body: { message?: string; city?: string; country?: string; lat?: number; lng?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ reply: 'Something went wrong reading your message. Try again! 🔄' }, { status: 400 });
  }

  const rawMessage = typeof body.message === 'string' ? body.message : '';
  // Reject obviously abusive payloads outright (cheaper than truncating + calling).
  if (rawMessage.length > 4000) {
    return NextResponse.json({ reply: 'That message is a bit too long — try a shorter question! ✂️' }, { status: 413 });
  }

  const message = rawMessage.trim().slice(0, MAX_MESSAGE_LEN);
  const city    = typeof body.city === 'string'    ? body.city.slice(0, MAX_CITY_LEN).replace(/[<>{}]/g, '')    : undefined;
  const country = typeof body.country === 'string' ? body.country.slice(0, MAX_CITY_LEN).replace(/[<>{}]/g, '') : undefined;

  if (!message) {
    return NextResponse.json({ reply: 'What city or event are you curious about? 🌍' });
  }

  // ── Nova Brain (FREE) — answer from our own events DB first ───────────────
  // Resolve coordinates (explicit → IP-geo → city) so the brain can run its geo
  // query. This costs nothing and is usually all we need.
  let lat = typeof body.lat === 'number' ? body.lat : NaN;
  let lng = typeof body.lng === 'number' ? body.lng : NaN;
  let resolvedCity = city;
  try {
    const geo = await resolveRequestGeo(
      request.headers,
      Number.isFinite(lat) ? String(lat) : null,
      Number.isFinite(lng) ? String(lng) : null,
      city ?? '', country ?? '',
    );
    lat = geo.lat; lng = geo.lng; resolvedCity = geo.city || city;
  } catch { /* keep what we had */ }

  try {
    const local = await answerLocally({ message, city: resolvedCity, country, lat, lng });
    if (local.used && local.reply) {
      return NextResponse.json({ reply: local.reply, source: 'nova_brain' });
    }
  } catch (err) {
    console.error('[chat/brain]', err);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const locationContext = resolvedCity ? `The user is currently in ${resolvedCity}, ${country || ''}.` : 'User location unknown.';

  // No DB match and no LLM key → still give a useful, honest answer for free.
  if (!apiKey) {
    return NextResponse.json({
      reply: `I couldn't find anything matching that ${resolvedCity ? `in ${resolvedCity}` : 'near you'} in our live listings just yet. Try a broader question like "what's on this weekend?" or "live music near me", or open the Events tab to browse everything happening locally! 🎉`,
      source: 'nova_brain',
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
      signal: AbortSignal.timeout(15000),
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
