import { NextRequest, NextResponse } from 'next/server';
import { isCronRequest } from '@/lib/cronAuth';
import { dbWriteEnabled, upsertEvents, postToRow } from '@/lib/eventsDb';
import {
  searchRealEventsWithClaude, claudeAvailable, ClaudeUnavailableError,
  AI_SEARCH_TIMEOUT_MS, AI_SEARCH_MIN_MS,
} from '@/lib/sources/claudeAI';
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
  // Fails CLOSED when no secret is configured — see src/lib/cronAuth.ts.
  if (!isCronRequest(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, note: 'no ANTHROPIC_API_KEY' });
  if (!dbWriteEnabled) return NextResponse.json({ ok: false, note: 'DB writes disabled' });

  // Anthropic was out of credit for days in September; every call still cost a
  // full 25-second round trip before failing. Check once, up front.
  if (!(await claudeAvailable())) {
    return NextResponse.json({
      ok: true, ingested: 0, processed: 0, offset: 0, nextOffset: null,
      total: TOWNS.length, done: true, skipped: 'anthropic_unavailable',
    });
  }

  const sp = new URL(request.url).searchParams;
  const offset = Math.max(0, parseInt(sp.get('offset') || '0', 10));
  const count = Math.max(4, Math.min(12, parseInt(sp.get('count') || '10', 10)));
  const today = todayStr();

  // ── Why this is a ceiling and not a deadline ──────────────────────────────
  // This route logged "Vercel Runtime Timeout Error: Task timed out after 60
  // seconds". The old code checked `Date.now() > deadline` with deadline at 45s
  // and then started a town whose AI search is allowed to take 25 — so a town
  // beginning at 44.9s ran to ~70s and the platform killed the function. The
  // check was between items; the cost was inside one.
  //
  // So each town's search now gets what is actually LEFT under the ceiling, and
  // when that is less than a search needs we stop and let the next invocation
  // start it with a full window. Same fix the main ingest route already carries.
  const startedAt = Date.now();
  const SLICE_CEILING_MS = 54_000;   // platform kills at 60
  const TAIL_RESERVE_MS = 6_000;     // the upsert after the search returns

  let ingested = 0, processed = 0;
  const errors: string[] = [];
  let i = offset;
  for (; i < TOWNS.length; i++) {
    const searchBudget = Math.min(
      AI_SEARCH_TIMEOUT_MS,
      startedAt + SLICE_CEILING_MS - TAIL_RESERVE_MS - Date.now(),
    );
    if (searchBudget < AI_SEARCH_MIN_MS) break;

    const [city, country, lat, lng] = TOWNS[i];
    try {
      const posts = await searchRealEventsWithClaude(
        city, country, today, count, 0, 'events', apiKey,
        lat, lng, /* tourismFocus */ true, searchBudget,
      );
      const clean = dropExpired(dedupePosts(posts)).filter(p => p && p.id && p.eventDateRaw);
      if (clean.length) {
        const rows = clean.map(p => postToRow(p, 'tour', country));
        ingested += await upsertEvents(rows, {
          budgetMs: Math.max(2_000, startedAt + SLICE_CEILING_MS - Date.now()),
        });
      }
      processed++;
    } catch (err) {
      // The account ran dry mid-run: every remaining town would fail the same
      // way. Stop here and report an honest resume point.
      if (err instanceof ClaudeUnavailableError) {
        errors.push(`${city}:anthropic unavailable`);
        break;
      }
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
