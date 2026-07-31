import { NextRequest, NextResponse } from 'next/server';
import { answerLocally, parseIntent } from '@/lib/novaBrain';
import { answerTrip, answerFromLive } from '@/lib/brain/assistant';
import type { ApiPost } from '@/lib/sources/shared';
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

  const origin = new URL(request.url).origin;

  // ── Trip planning ─────────────────────────────────────────────────────────
  // "I'm going to Rome in three weeks — what's worth seeing?" is a different
  // question from "what's on tonight", and it is half of what this app is for.
  // Answered first, because a trip question mentioning a city would otherwise be
  // handled as a query about the user's current one.
  try {
    const trip = await answerTrip(message, origin, { lat, lng, city: resolvedCity ?? '', country: country ?? '' });
    if (trip) return NextResponse.json({ reply: trip.reply, source: 'nova_trip', city: trip.city });
  } catch (err) {
    console.error('[chat/trip]', err);
  }

  try {
    const local = await answerLocally({ message, city: resolvedCity, country, lat, lng });
    if (local.used && local.reply) {
      return NextResponse.json({ reply: local.reply, source: 'nova_brain' });
    }
  } catch (err) {
    console.error('[chat/brain]', err);
  }

  // ── Live fallback — the fix for "works in Vienna only" ────────────────────
  // Our DB doesn't cover this city yet. Rather than giving up (and blaming the
  // network for it), ask the app's own feed — the same pipeline the Discover tab
  // uses — and answer from that. It also write-throughs to the DB, so the next
  // person asking about this city gets an instant answer.
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng)) {
    try {
      const intent = parseIntent(message);
      const posts = await answerFromLive(
        origin,
        { lat, lng, city: resolvedCity ?? '', country: country ?? '' },
        intent.categories,
        intent.window,
      );
      if (posts.length > 0) {
        return NextResponse.json({
          reply: composeLiveReply(posts, resolvedCity ?? 'your area'),
          source: 'nova_live',
        });
      }
    } catch (err) {
      console.error('[chat/live]', err);
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const locationContext = resolvedCity ? `The user is currently in ${resolvedCity}, ${country || ''}.` : 'User location unknown.';

  // No DB match and no LLM key → still give a useful, honest answer for free.
  if (!apiKey) {
    const cityHint = resolvedCity ? ` in ${resolvedCity}` : '';
    return NextResponse.json({
      reply: `Our live listings${cityHint} are still growing — I don't have a match for that yet. Try browsing the **Events tab** for what's on nearby, or ask me something like:\n• "Best rooftop bars${cityHint}?"\n• "Any markets this weekend?"\n• "Live music spots${cityHint}?" 🎉`,
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
    // Be honest about what happened. The old message blamed the network for
    // what was usually "we have no data for this city", which is a different
    // problem and sends the user off to check their wifi for nothing.
    const where = resolvedCity ? ` for ${resolvedCity}` : '';
    return NextResponse.json({
      reply: `I couldn't pull live listings${where} just now. I've asked for them in the background — try me again in a moment, or open the **Discover** tab to see what's already loaded. 🔄`,
    });
  }
}

/** Turn live feed results into the same shape of answer the DB path gives. */
function composeLiveReply(posts: ApiPost[], city: string): string {
  const lines: string[] = [`Here's what I'm seeing in ${city}: ✨`, ''];
  for (const p of posts.slice(0, 5)) {
    const title = (p.caption?.split('\n')[0] ?? '').slice(0, 74);
    const when = p.eventDateRaw
      ? new Date(`${p.eventDateRaw}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
      : null;
    lines.push(`• *${title}*`);
    if (when) lines.push(`   📅 ${when}`);
    if (p.eventVenue || p.location?.name) lines.push(`   📍 ${(p.eventVenue || p.location?.name || '').slice(0, 70)}`);
    if (p.eventUrl) lines.push(`   🔗 ${p.eventUrl}`);
  }
  lines.push('', 'Open the Discover tab for the full list — and ask me about a city you\'re travelling to and I\'ll plan it out. 🧭');
  return lines.join('\n');
}
