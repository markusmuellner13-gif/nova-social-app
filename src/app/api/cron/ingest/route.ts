import { NextRequest, NextResponse } from 'next/server';
import { isCronRequest } from '@/lib/cronAuth';
import { dbWriteEnabled, upsertEvents, purgeExpiredEvents, postToRow } from '@/lib/eventsDb';
import { validateBatch } from '@/lib/eventValidation';
import { recordSourceYield } from '@/lib/sourceStats';
import { curate, recordCuration, prewarmImages, type CurationReport } from '@/lib/brain/curator';
import type { ApiPost } from '@/lib/sources/shared';
import { backfillVenueCoords } from '@/lib/sources/venueGeo';
import {
  loadDemand, demandScore, interleaveByDemand, partitionByDemand, buildSweepQueue,
} from '@/lib/demand';
import { readCursor, writeCursor, timeDerivedCursor } from '@/lib/ingestCursor';
import { scheduleTier } from './schedule';
import { appOrigin } from '@/lib/appOrigin';

// 300s, not 60. The old value was the HOBBY plan's cap, and this project has
// been on Pro for a long time — /api/cron/warm in this same folder has run at
// 300 for months. At 60 the route stopped starting new work after 30 seconds,
// so half of every invocation's potential was thrown away and the rest was
// spent on per-invocation overhead. Every budget below is derived from this
// number rather than hardcoded, so changing it here changes them all coherently.
export const maxDuration = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Ingestion worker — populates the app's OWN events DB so users are served from
// Postgres (fast, cheap, scalable) instead of hitting live third-party APIs per
// request. It reuses /api/feed?fresh=1 (which already orchestrates Ticketmaster /
// SeatGeek / OSM / Wikipedia, enrichment, images, dedup) and upserts the results.
//
// Runs on the Vercel cron (see vercel.json). No-ops unless SUPABASE_SERVICE_ROLE_KEY
// is configured (writes need it). Reads/serving fall back to live until then.
// ─────────────────────────────────────────────────────────────────────────────

// Worldwide coverage so every user — wherever they open the app — is served
// from our own DB. Austria is dense (the home market: Vienna, Graz, Linz,
// Salzburg, Innsbruck, Baden, Wiener Neustadt, Klagenfurt) plus the major
// European and global metros. The cron resumes across days via ?offset, so a
// long list is fine — each daily slice just refreshes the next chunk.
const CITIES: [string, string, number, number][] = [
  // ── Austria (home market — dense) ──
  ['Vienna',          'Austria',     48.2082, 16.3738],
  ['Graz',            'Austria',     47.0707, 15.4395],
  ['Linz',            'Austria',     48.3069, 14.2858],
  ['Salzburg',        'Austria',     47.8095, 13.0550],
  ['Innsbruck',       'Austria',     47.2692, 11.4041],
  ['Klagenfurt',      'Austria',     46.6247, 14.3050],
  ['Baden',           'Austria',     48.0059, 16.2342],
  ['Wiener Neustadt', 'Austria',     47.8149, 16.2425],
  ['Bregenz',         'Austria',     47.5031,  9.7471],
  ['St. Pölten',      'Austria',     48.2047, 15.6256],
  ['Villach',         'Austria',     46.6111, 13.8558],
  ['Wels',            'Austria',     48.1575, 14.0289],
  ['Dornbirn',        'Austria',     47.4125,  9.7417],
  ['Mödling',         'Austria',     48.0857, 16.2897],
  ['Krems',           'Austria',     48.4100, 15.6140],
  ['Eisenstadt',      'Austria',     47.8456, 16.5247],
  // ── Italy ──
  ['Rome',            'Italy',       41.9028, 12.4964],
  ['Milan',           'Italy',       45.4642,  9.1900],
  ['Florence',        'Italy',       43.7696, 11.2558],
  ['Venice',          'Italy',       45.4408, 12.3155],
  ['Naples',          'Italy',       40.8518, 14.2681],
  ['Turin',           'Italy',       45.0703,  7.6869],
  ['Bologna',         'Italy',       44.4949, 11.3426],
  ['Verona',          'Italy',       45.4384, 10.9916],
  ['Genoa',           'Italy',       44.4056,  8.9463],
  ['Palermo',         'Italy',       38.1157, 13.3615],
  // ── Germany / Switzerland ──
  ['Berlin',          'Germany',     52.5200, 13.4050],
  ['Munich',          'Germany',     48.1351, 11.5820],
  ['Hamburg',         'Germany',     53.5511,  9.9937],
  ['Cologne',         'Germany',     50.9375,  6.9603],
  ['Frankfurt',       'Germany',     50.1109,  8.6821],
  ['Stuttgart',       'Germany',     48.7758,  9.1829],
  ['Düsseldorf',      'Germany',     51.2277,  6.7735],
  ['Leipzig',         'Germany',     51.3397, 12.3731],
  ['Dresden',         'Germany',     51.0504, 13.7373],
  ['Zurich',          'Switzerland', 47.3769,  8.5417],
  ['Geneva',          'Switzerland', 46.2044,  6.1432],
  ['Basel',           'Switzerland', 47.5596,  7.5886],
  // ── Rest of Europe ──
  ['London',          'UK',          51.5074, -0.1278],
  ['Manchester',      'UK',          53.4808, -2.2426],
  ['Edinburgh',       'UK',          55.9533, -3.1883],
  ['Paris',           'France',      48.8566,  2.3522],
  ['Lyon',            'France',      45.7640,  4.8357],
  ['Marseille',       'France',      43.2965,  5.3698],
  ['Barcelona',       'Spain',       41.3851,  2.1734],
  ['Madrid',          'Spain',       40.4168, -3.7038],
  ['Valencia',        'Spain',       39.4699, -0.3763],
  ['Amsterdam',       'Netherlands', 52.3676,  4.9041],
  ['Rotterdam',       'Netherlands', 51.9244,  4.4777],
  ['Brussels',        'Belgium',     50.8503,  4.3517],
  ['Prague',          'Czechia',     50.0755, 14.4378],
  ['Budapest',        'Hungary',     47.4979, 19.0402],
  ['Warsaw',          'Poland',      52.2297, 21.0122],
  ['Kraków',          'Poland',      50.0647, 19.9450],
  ['Lisbon',          'Portugal',    38.7223, -9.1393],
  ['Porto',           'Portugal',    41.1579, -8.6291],
  ['Dublin',          'Ireland',     53.3498, -6.2603],
  ['Copenhagen',      'Denmark',     55.6761, 12.5683],
  ['Stockholm',       'Sweden',      59.3293, 18.0686],
  ['Oslo',            'Norway',      59.9139, 10.7522],
  ['Helsinki',        'Finland',     60.1699, 24.9384],
  ['Athens',          'Greece',      37.9838, 23.7275],
  ['Zagreb',          'Croatia',     45.8150, 15.9819],
  ['Bratislava',      'Slovakia',    48.1486, 17.1077],
  ['Ljubljana',       'Slovenia',    46.0569, 14.5058],
  // ── Americas / Asia / Oceania ──
  ['New York',        'USA',         40.7128, -74.0060],
  ['Los Angeles',     'USA',         34.0522, -118.2437],
  ['Chicago',         'USA',         41.8781, -87.6298],
  ['Miami',           'USA',         25.7617, -80.1918],
  ['San Francisco',   'USA',         37.7749, -122.4194],
  ['Toronto',         'Canada',      43.6532, -79.3832],
  ['Montreal',        'Canada',      45.5019, -73.5674],
  ['Mexico City',     'Mexico',      19.4326, -99.1332],
  ['São Paulo',       'Brazil',     -23.5558, -46.6396],
  ['Dubai',           'UAE',         25.2048, 55.2708],
  ['Singapore',       'Singapore',    1.3521, 103.8198],
  ['Tokyo',           'Japan',       35.6762, 139.6503],
  ['Seoul',           'South Korea', 37.5665, 126.9780],
  ['Sydney',          'Australia',  -33.8688, 151.2093],
  ['Melbourne',       'Australia',  -37.8136, 144.9631],
];

// Every category the app surfaces, so each city carries a full spread across
// all chips. Place categories come from OSM, sightseeing from Wikipedia,
// events/music/sports/art from Ticketmaster/SeatGeek/Eventbrite, and the
// long-tail (food/fitness/lifestyle/community/tech/fashion/travel/pets) is
// filled by Eventbrite + the AI web-search fallback when the fast sources are
// sparse — exactly mirroring the live /api/feed behaviour.
// ── Freshness tiers ───────────────────────────────────────────────────────────
// Not all content ages at the same rate. "What's on" (concerts, club nights,
// matches, exhibitions) changes constantly and must be refreshed often; a museum,
// a restaurant, a hiking trail or a hotel barely changes week-to-week, so
// refreshing those daily-ish is plenty and saves compute.
//
//   ?tier=fast → only the time-sensitive categories (refresh every ~30 min)
//   ?tier=slow → only the slow-moving places (refresh ~daily)
//   (no tier)  → the full catalogue, fast categories first
const FAST_CATEGORIES = ['events', 'music', 'sports', 'art', 'venues', 'community'];

// How many pages deep to sweep the fast (event) categories. Page 0 alone capped
// every city at `PER_PAGE` events per category regardless of what the sources
// held; 3 pages triples the ceiling from the SAME free sources at no API cost.
// Raising this lengthens the work list, so each city comes round less often —
// 3 is the point where extra depth stops beating extra freshness.
const EXTRA_PAGES = 3;

// Posts requested per (city × category × page). Was 12; the free sources return
// more than that per page, so the extra was simply being discarded.
const PER_PAGE = 20;
const SLOW_CATEGORIES = [
  'sightseeing', 'restaurants', 'hotels', 'rentals', 'shops',
  'food', 'fitness', 'lifestyle', 'tech', 'fashion', 'travel', 'pets', 'outdoors',
];
const CATEGORIES = [...FAST_CATEGORIES, ...SLOW_CATEGORIES];

function categoriesForTier(tier: string | null): string[] {
  if (tier === 'fast') return FAST_CATEGORIES;
  if (tier === 'slow') return SLOW_CATEGORIES;
  return CATEGORIES;
}


function sourceOf(id: string): string {
  return (id.split('_')[0] || 'feed').slice(0, 12);
}

export async function GET(request: NextRequest) {
  // Fails CLOSED when no secret is configured — see src/lib/cronAuth.ts.
  if (!isCronRequest(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!dbWriteEnabled) {
    return NextResponse.json({ ok: false, ingested: 0, note: 'DB writes disabled (set SUPABASE_SERVICE_ROLE_KEY)' });
  }

  const origin = appOrigin(request);
  const sp = new URL(request.url).searchParams;

  // Which freshness tier to refresh this call (see FAST/SLOW_CATEGORIES above).
  //
  // A Vercel cron can only call a plain path — the docs show no way to attach a
  // query string, and guessing at undocumented behaviour in production config is
  // how you get a schedule that silently does the wrong thing. So the two
  // schedules share one path and identify themselves with the documented
  // `x-vercel-cron-schedule` header, which carries the cron expression that
  // fired.
  //
  // Unknown schedule → the FULL catalogue, which is the safe default: editing
  // vercel.json without touching this map degrades to "sweeps everything, less
  // often", never to "sweeps nothing".
  const tier = sp.get('tier') ?? scheduleTier(request.headers.get('x-vercel-cron-schedule'));
  const cats = categoriesForTier(tier);

  // Flatten to (city × category) work items so we can resume across invocations —
  // the Hobby plan caps functions at ~60s, so each call processes a time-bounded
  // slice and returns nextOffset. Call repeatedly until done=true. Offsets are
  // relative to the selected tier's work list.
  // The sweep only ever fetched page 0, so a city's catalogue was capped at
  // `count` posts per category no matter how much the sources actually had.
  // Pages are added as EXTRA WORK ITEMS rather than extra work inside an item:
  // each item keeps its existing ~24s cost and the offset/rotation machinery
  // already handles a longer list, so this deepens coverage without pushing any
  // single invocation towards the 60s platform cap.
  //
  // Only the fast tier gets extra pages. Slow categories are OSM/Wikipedia
  // places, where page>0 mostly returns nothing — spending slices on empty
  // pages would make coverage worse, not better.
  const built: { city: string; country: string; lat: number; lng: number; category: string; page: number }[] = [];
  for (const [city, country, lat, lng] of CITIES) {
    for (const category of cats) {
      const pages = FAST_CATEGORIES.includes(category) ? EXTRA_PAGES : 1;
      for (let page = 0; page < pages; page++) built.push({ city, country, lat, lng, category, page });
    }
  }

  // ── Refresh what people actually open, first ──────────────────────────────
  // Walking this list in a fixed order spread the budget evenly over all 80
  // cities, which measured out at ONE FULL SWEEP EVERY ELEVEN DAYS — so
  // Melbourne and Seoul, which essentially nobody opens, were refreshed exactly
  // as often as Vienna and Baden. Ordering by measured demand buys hourly
  // freshness where the users are for exactly the same number of slices.
  //
  // The long tail is not abandoned: one in every four items is still a cold one,
  // rotating, so a city nobody has opened yet is still swept — just less often.
  // See src/lib/demand.ts. Without Redis the score map is empty and this returns
  // the list untouched, i.e. exactly today's behaviour.
  //
  // Page 0 leads its city's other pages regardless of demand: a page-2 refresh
  // for a popular city is worth less than page 0 of a city nobody has swept yet.
  const demand = await loadDemand();
  const scoreOf = (w: { lat: number; lng: number; category: string; page: number }) =>
    demandScore(demand, w.lat, w.lng, w.category) / (w.page + 1);

  // ── Budgets, all derived from maxDuration ─────────────────────────────────
  // The deadline is checked BETWEEN items and any single item can run up to its
  // own fetch timeout past that check, so "stop starting work" must sit a full
  // item's cost below the ceiling. A cold city's live compute (Overpass + image
  // enrichment across a dozen places) runs 16–22s, hence the 24s item timeout.
  const startedAt = Date.now();
  const BUDGET_MS = maxDuration * 1_000;
  // The hard ceiling all per-item work must finish by. The margin matters more
  // than it looks: the cursor is written AFTER the sweep, so a run the platform
  // kills never records its progress and the next run redoes all of it. 15s is
  // room for the tail, the cursor write and the response.
  const SLICE_CEILING_MS = BUDGET_MS - 15_000;
  const GEO_BUDGET_MS = 8_000;
  // The per-item feed fetch, and the floor below which starting one is pointless.
  const FETCH_TIMEOUT_MS = 24_000;
  const MIN_FETCH_MS = 8_000;
  // What the tail of an item needs after the fetch returns: the geocode pass, the
  // upsert and the image prewarm. Reserved so the fetch can never consume it.
  const TAIL_RESERVE_MS = 12_000;
  // Stop STARTING items here, so the last one still has a full item's worth of
  // ceiling left to finish in.
  const deadline = startedAt + SLICE_CEILING_MS - FETCH_TIMEOUT_MS - TAIL_RESERVE_MS;

  // ── Which items, in which order ───────────────────────────────────────────
  // Two ways in, and they are genuinely different jobs:
  //
  //   ?offset=N  a bulk sweep driven from outside — a manual run, or the GitHub
  //              workflow. Walks ONE demand-ordered array from N and reports
  //              nextOffset, exactly as before.
  //
  //   no offset  the scheduled Vercel cron. Resumes from the stored cursors, so
  //              nothing outside the app has to carry state between runs. The
  //              wanted items and the long tail advance independently — see
  //              buildSweepQueue in src/lib/demand.ts for why one cursor cannot
  //              work here.
  const explicitOffset = sp.has('offset');
  const tierKey = tier ?? 'all';

  // Roughly what one invocation gets through: the item-starting window divided
  // by a measured item cost. Only used to size the queue and the no-Redis
  // fallback, so an imprecise estimate costs nothing.
  const EST_ITEM_MS = 12_000;
  const perRun = Math.max(4, Math.floor((deadline - startedAt) / EST_ITEM_MS));

  const { hot, cold } = partitionByDemand(built, scoreOf);
  const stored = explicitOffset ? null : await readCursor(tierKey);
  // No Redis and no memory: derive a position from the clock so consecutive
  // runs still land on different work instead of redoing the same items.
  const startHot  = stored?.hot  ?? timeDerivedCursor(300_000, perRun);
  const startCold = stored?.cold ?? timeDerivedCursor(300_000, perRun);

  // The flat list the ?offset path walks.
  const work = interleaveByDemand(built, scoreOf, startCold);
  // The queue the scheduled path walks — over-provisioned, because the loop
  // stops on time rather than on length.
  const queue = buildSweepQueue(hot, cold, startHot, startCold, perRun * 3);

  let ingested = 0;
  let rejected = 0;
  let processed = 0;
  // Nova Brain's curation pass: how much was merged away as duplicate or dropped
  // as filler, and how many image renders we warmed for the accepted posts.
  let curatedOut = 0;
  let prewarmed = 0;
  // How many city-centred posts got their venue's real coordinates this slice.
  let located = 0;
  let geoAttempted = 0;
  const curationReports: CurationReport[] = [];
  const errors: string[] = [];
  // Accumulate per-source accept/reject so the learning layer knows which
  // sources actually deliver good data.
  const srcYield: Record<string, { a: number; r: number }> = {};

  // The items this invocation will actually attempt, in order. One shape for
  // both modes so the loop below, the watchdog and the resume arithmetic stay
  // single-path.
  const offset = explicitOffset ? Math.max(0, parseInt(sp.get('offset') || '0', 10)) : 0;
  const plan = explicitOffset
    ? work.slice(offset).map(item => ({ item, from: 'hot' as const }))
    : queue;

  // `i` lives outside the sweep so the watchdog below can report the right
  // resume point even if it has to answer while an item is still in flight.
  // It counts items CONSUMED from `plan`, which is what both cursors and
  // nextOffset are derived from.
  let i = 0;
  let hotDone = 0;
  let coldDone = 0;

  const sweep = async () => {
    for (; i < plan.length; i++) {
      if (Date.now() > deadline) break;
      // The fetch is not the last thing an item does — curation, the geocode pass,
      // the upsert and the image prewarm all run after it. Giving the fetch a flat
      // 24s ignored that: an item starting at 29.9s spent 24s fetching and was
      // still writing rows when the platform killed the function at 60s, losing
      // the whole slice. MEASURED on the 13:09 run — two slices died this way, and
      // a killed slice returns no nextOffset, so the workflow's chain stops early.
      //
      // So the fetch gets whatever is left under the ceiling, minus the reserve the
      // tail needs. Below the floor there isn't time to do useful work, so stop and
      // let the next invocation pick up from this offset with a full window.
      const fetchBudget = Math.min(
        FETCH_TIMEOUT_MS,
        startedAt + SLICE_CEILING_MS - TAIL_RESERVE_MS - Date.now(),
      );
      if (fetchBudget < MIN_FETCH_MS) break;
      const { city, country, lat, lng, category, page } = plan[i].item;
      if (plan[i].from === 'hot') hotDone++; else coldDone++;
      try {
        const params = new URLSearchParams({
          city, country, lat: String(lat), lng: String(lng),
          page: String(page), radius: '25', count: String(PER_PAGE), category, fresh: '1',
          // Ingest has a 24s window per city and its result is STORED, so it can
          // afford to chase down a real photo for every post. A visitor's request
          // gets the short budget; this pass is what makes the stored row arrive
          // with a picture already on it.
          photoBudgetMs: '12000',
        });
        // `x-nova-internal` keeps the sweep out of its own demand statistics —
      // see the note in /api/feed. Without it the ranking would measure the
      // cron's own activity instead of the users'.
      const res = await fetch(`${origin}/api/feed?${params}`, {
        headers: { 'x-nova-internal': '1' },
        signal: AbortSignal.timeout(fetchBudget),
      });
        if (!res.ok) { errors.push(`${city}/${category}#${page}:${res.status}`); processed++; continue; }
        const data = await res.json() as { posts?: ApiPost[] };
        const raw = (data.posts ?? []).filter(p => p && p.id && p.location?.lat);

        // GATE 1 — structural validity: real date, real coordinates, not spam.
        const { valid, rejected: rej } = validateBatch(raw, { cityLat: lat, cityLng: lng, maxKm: 120 });
        rejected += rej;

        // GATE 2 — Nova Brain's curator: merge listings that are the same
        // real-world thing arriving from different sources, then drop the filler
        // that is technically valid but not worth a user's screen. The bar adapts
        // to how much this area actually has, so a small town is never emptied out.
        const { kept: curated, report } = curate(valid);
        curatedOut += report.mergedDuplicates + report.droppedLowQuality;
        curationReports.push(report);

        // Tally per-source accept/reject for the learning layer — measured against
        // what SURVIVED curation, so a source that floods us with valid-but-thin
        // listings is scored down, not rewarded for volume.
        const bySource: Record<string, { raw: number; ok: number }> = {};
        for (const p of raw)     (bySource[sourceOf(p.id)] ??= { raw: 0, ok: 0 }).raw++;
        for (const p of curated) (bySource[sourceOf(p.id)] ??= { raw: 0, ok: 0 }).ok++;
        for (const [s, v] of Object.entries(bySource)) {
          (srcYield[s] ??= { a: 0, r: 0 });
          srcYield[s].a += v.ok;
          srcYield[s].r += v.raw - v.ok;
        }

        if (curated.length) {
          // GATE 3 — put each post where it actually IS. Crawled listings rarely
          // publish geo, so they fall back to the CITY CENTRE: measured Vienna,
          // 8 posts shared 2 coordinate pairs and every distanceKm was 0. That
          // silently broke distance labels, stacked every map pin on one dot and
          // fed the ranker's `proximity` feature a constant. Geocoding here means
          // the stored row is correct forever and no user request ever pays for
          // it. Time-boxed, and unresolved posts simply keep the centre.
          const geoBudget = Math.min(GEO_BUDGET_MS, startedAt + SLICE_CEILING_MS - Date.now());
          if (geoBudget > 0) {
            const geo = await backfillVenueCoords(curated, {
              city, cityLat: lat, cityLng: lng, budgetMs: geoBudget,
            }).catch(() => ({ located: 0, attempted: 0 }));
            located += geo.located;
            geoAttempted += geo.attempted;
          }

          const rows = curated.map(p => postToRow(p, sourceOf(p.id), country));
          // The write gets an explicit slice of the remaining time. Without one it
          // had no timeout at all, and a write stuck behind a lock held the
          // function until the platform killed it — losing the slice AND its
          // nextOffset. See the note in src/lib/eventsDb.ts.
          ingested += await upsertEvents(rows, {
            budgetMs: Math.max(2_000, startedAt + SLICE_CEILING_MS - Date.now() - 3_000),
          });
          // Warm the image renders for what we just stored, so the first real
          // visitor gets a cached photo rather than paying the cold resize.
          prewarmed += await prewarmImages(curated, origin).catch(() => 0);
        }
        processed++;
      } catch (err) {
        errors.push(`${city}/${category}#${page}:${err instanceof Error ? err.message : 'err'}`);
        processed++;
      }
    }
  };

  // ── The watchdog ──────────────────────────────────────────────────────────
  // Everything above is time-boxed, but "time-boxed" has failed before: an
  // unbounded upsert, a fetch that ignores its signal, a slow tail. When it
  // fails the platform kills the function at 60s, the response never arrives,
  // and the GitHub workflow sees a 504 with no nextOffset — so the chain stops
  // and the run goes red. THAT is the "workflow failed" mail.
  //
  // So the response no longer depends on the sweep finishing. At the ceiling we
  // answer with whatever the counters hold and the offset of the item still in
  // flight, which the next slice simply redoes. Work already upserted is
  // committed; an unfinished item is idempotent (upsert by id). Answering late
  // but honestly beats not answering at all.
  //
  // The timer is cleared on the normal path so a slice that finishes in 20s
  // doesn't leave a 34-second timer pending behind its own response.
  let timedOut = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    sweep(),
    new Promise<void>(resolve => {
      watchdog = setTimeout(
        () => { timedOut = true; resolve(); },
        Math.max(0, startedAt + SLICE_CEILING_MS - Date.now()),
      );
    }),
  ]);
  clearTimeout(watchdog);

  // In ?offset mode the plan is the remainder of the work list, so finishing it
  // means the sweep is finished. In cursor mode the queue is a slice of an
  // endless rotation and there is nothing to be "done" with.
  const done = explicitOffset && !timedOut && i >= plan.length;

  // ── Remember where we stopped ─────────────────────────────────────────────
  // Only the scheduled path owns the cursors. An ?offset run is somebody
  // sweeping deliberately, and must not move the schedule's position from under
  // it. Advancing by what was ACTUALLY consumed — not by what was queued — is
  // what makes a short or watchdog-truncated run resume correctly rather than
  // skipping the items it never reached.
  if (!explicitOffset && (hotDone > 0 || coldDone > 0)) {
    await writeCursor(tierKey, { hot: startHot + hotDone, cold: startCold + coldDone });
  }

  // ── The tail ──────────────────────────────────────────────────────────────
  // Bounded as a whole. These are all best-effort bookkeeping: none of them is
  // worth losing the slice's nextOffset over, which is what happens if they run
  // past the platform cap.
  const tailBudget = Math.max(0, startedAt + BUDGET_MS - 8_000 - Date.now());
  let purged = 0;
  if (tailBudget > 500) {
    let tailTimer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      (async () => {
        // At most one purge an hour app-wide now, not one per slice. The old
        // per-slice DELETE ran 23,359 times and is a third of this app's write
        // traffic — the queue the timing-out upserts were stuck behind. See the
        // measurements in src/lib/eventsDb.ts.
        purged = await purgeExpiredEvents().catch(() => 0);

        // Feed curation outcomes into the source-reliability learner too, so the
        // engine gradually favours the sources whose listings actually survive.
        await Promise.all(curationReports.map(r => recordCuration(r).catch(() => {})));

        // Persist what we learned about each source this run (gated/no-op w/o Redis).
        await Promise.all(Object.entries(srcYield).map(([s, y]) =>
          recordSourceYield(s, y.a, Math.max(0, y.r)).catch(() => {})
        ));
      })(),
      new Promise<void>(resolve => { tailTimer = setTimeout(resolve, tailBudget); }),
    ]);
    clearTimeout(tailTimer);
  }

  // A sweep that tried and wrote NOTHING is the shape of every silent failure
  // this route has had: a dead API key, a feed that 401s, and most recently a
  // cron fetching an SSO-protected origin and getting 302 on every item. All
  // three returned a cheerful 200 with `ingested: 0`, which reads exactly like
  // "there was nothing new to ingest" and so was never noticed.
  //
  // It is not proof of a fault — a re-sweep of unchanged cities legitimately
  // writes little — but combined with zero curated posts across every item it
  // means the sweep is not seeing data, and that is worth one loud line with the
  // first few reasons attached. Picked up by the `[breaker/*]`-style Sentry rules
  // in docs/ALERTING.md.
  if (processed >= 3 && ingested === 0) {
    console.error(
      `[ingest/barren] ${processed} items processed, 0 rows written (origin=${origin}) — ${errors.slice(0, 3).join(' | ') || 'no per-item errors recorded'}`,
    );
  }

  return NextResponse.json({
    ok: true, tier: tierKey, ingested, rejected, curatedOut, prewarmed,
    located, geoAttempted, processed, purged, timedOut,
    // How the run was driven, and where it got to. `mode` matters when reading
    // logs: the two paths advance completely different state.
    mode: explicitOffset ? 'offset' : 'cursor',
    offset,
    nextOffset: explicitOffset ? (done ? null : offset + i) : null,
    hotDone, coldDone,
    hotPool: hot.length, coldPool: cold.length,
    cursor: explicitOffset ? null : { hot: startHot + hotDone, cold: startCold + coldDone },
    total: built.length, done, errors: errors.slice(0, 8),
  });
}
