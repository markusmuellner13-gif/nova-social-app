import { NextRequest, NextResponse } from 'next/server';
import { dbWriteEnabled, upsertEvents, postToRow } from '@/lib/eventsDb';
import { searchRealEventsWithClaude } from '@/lib/sources/claudeAI';
import { dropExpired, dedupePosts, todayStr } from '@/lib/sources/shared';

export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// SMALL-TOWN ingestion — the kind of events that never make it onto ticket
// platforms: town festivals, casino & theatre shows, city marathons, firefighter
// festivals, wine/food fests, Christmas markets, open-air concerts. We pull these
// from each town's OWN tourism/event-calendar websites via Claude web search
// (tourismFocus), which Ticketmaster/SeatGeek would otherwise drown out with
// big-city events. Resumable via ?offset (AI search is slow), gated on
// ANTHROPIC_API_KEY + SUPABASE_SERVICE_ROLE_KEY.
//
// Towns are ordered: Baden + its ring first, then northern-Italy small towns
// (Besana in Brianza & the Milan/Brianza belt), exactly as requested.
// ─────────────────────────────────────────────────────────────────────────────

const TOWNS: [string, string, number, number][] = [
  // ── Austria: Baden bei Wien + surrounding towns ──
  ['Baden',            'Austria', 48.0059, 16.2342],
  ['Mödling',          'Austria', 48.0857, 16.2833],
  ['Bad Vöslau',       'Austria', 47.9667, 16.2167],
  ['Traiskirchen',     'Austria', 48.0142, 16.2925],
  ['Gumpoldskirchen',  'Austria', 48.0419, 16.2733],
  ['Pfaffstätten',     'Austria', 48.0167, 16.2500],
  ['Berndorf',         'Austria', 47.9472, 16.1067],
  ['Leobersdorf',      'Austria', 47.9333, 16.2333],
  ['Wiener Neudorf',   'Austria', 48.0833, 16.3167],
  ['Perchtoldsdorf',   'Austria', 48.1183, 16.2667],
  // ── Northern Italy: Besana in Brianza + the Milan/Brianza belt ──
  ['Besana in Brianza','Italy',   45.7000, 9.2900],
  ['Monza',            'Italy',   45.5845, 9.2744],
  ['Seregno',          'Italy',   45.6500, 9.2050],
  ['Carate Brianza',   'Italy',   45.6700, 9.2400],
  ['Lissone',          'Italy',   45.6125, 9.2433],
  ['Desio',            'Italy',   45.6167, 9.2100],
  ['Vimercate',        'Italy',   45.6167, 9.3667],
  ['Cantù',            'Italy',   45.7400, 9.1300],
  ['Lecco',            'Italy',   45.8566, 9.3977],
  ['Como',             'Italy',   45.8081, 9.0852],
];

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, note: 'no ANTHROPIC_API_KEY' });
  if (!dbWriteEnabled) return NextResponse.json({ ok: false, note: 'DB writes disabled' });

  const sp = new URL(request.url).searchParams;
  const offset = Math.max(0, parseInt(sp.get('offset') || '0', 10));
  const count = Math.max(4, Math.min(12, parseInt(sp.get('count') || '10', 10)));
  const today = todayStr();
  const deadline = Date.now() + 45_000; // each town's AI search is ~15-25s

  let ingested = 0, processed = 0;
  const errors: string[] = [];
  let i = offset;
  for (; i < TOWNS.length; i++) {
    if (Date.now() > deadline) break;
    const [city, country, lat, lng] = TOWNS[i];
    try {
      const posts = await searchRealEventsWithClaude(
        city, country, today, count, 0, 'events', apiKey,
        lat, lng, /* tourismFocus */ true,
      );
      const clean = dropExpired(dedupePosts(posts)).filter(p => p && p.id && p.eventDateRaw);
      if (clean.length) {
        const rows = clean.map(p => postToRow(p, 'tour', country));
        ingested += await upsertEvents(rows);
      }
      processed++;
    } catch (err) {
      errors.push(`${city}:${err instanceof Error ? err.message : 'err'}`);
      processed++;
    }
  }

  const done = i >= TOWNS.length;
  return NextResponse.json({
    ok: true, ingested, processed, offset, nextOffset: done ? null : i,
    total: TOWNS.length, done, errors: errors.slice(0, 6),
  });
}
