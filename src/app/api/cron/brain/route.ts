import { NextRequest, NextResponse } from 'next/server';
import { loadGlobalModel, saveGlobalModel } from '@/lib/brain/store';
import { isUsable, MODEL_VERSION } from '@/lib/brain/ranker';
import { getAllSourceStats } from '@/lib/sourceStats';
import { dbReadEnabled, sampleEventsWorldwide } from '@/lib/eventsDb';
import { assessQuality } from '@/lib/brain/quality';
import { mergeDuplicates } from '@/lib/brain/curator';
import { FEATURE_NAMES } from '@/lib/brain/features';
import { topDestinations, gather } from '@/lib/brain/assistant';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/brain — Nova Brain's maintenance and self-report pass.
//
// The ranker trains continuously from live traffic (/api/brain/feedback), so
// this job does not do the learning; it does the housekeeping that keeps the
// learning honest and observable:
//
//   • reports the current model — how many examples it has seen and which
//     features it has actually learned to care about, so drift is visible
//     rather than mysterious;
//   • measures the quality of what is currently in the database, and how many
//     duplicate listings are still sitting in it;
//   • surfaces the learned per-source reliability that the ingestion engine
//     uses to decide which sources to trust.
//
// Runs on the same schedule as the warm cron. Auth: CRON_SECRET (or ADMIN_SECRET).
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_SOURCES = [
  'tm', 'eb', 'sg', 'osm', 'wiki', 'nova', 'ai', 'db', 'crawler',
];

function authorised(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET ?? process.env.ADMIN_SECRET;
  if (!expected) return false;
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token.length !== expected.length) return false;
  // Constant-time-ish compare so the secret can't be probed byte by byte.
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function GET(req: NextRequest) {
  // Vercel's own cron invocations carry the secret too; anything else is denied.
  if (!authorised(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const model = await loadGlobalModel();

  // What the model has actually learned — the biggest-magnitude weights, named.
  const weights = FEATURE_NAMES
    .map((name, i) => ({ name, w: Math.round((model.w[i] ?? 0) * 1000) / 1000 }))
    .sort((a, b) => Math.abs(b.w) - Math.abs(a.w));

  const sources = await getAllSourceStats(KNOWN_SOURCES).catch(() => ({}));

  // Sample what is in the DB and score it, so content quality is a number we
  // watch rather than a feeling.
  let corpus: { sampled: number; meanQuality: number; lowQuality: number; duplicates: number } | null = null;
  if (dbReadEnabled) {
    try {
      const sample = await sampleEventsWorldwide(400);
      if (sample.length > 0) {
        const scores = sample.map(p => assessQuality(p).score);
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        corpus = {
          sampled: sample.length,
          meanQuality: Math.round(mean * 1000) / 1000,
          lowQuality: scores.filter(s => s < 0.35).length,
          duplicates: mergeDuplicates(sample).removed,
        };
      }
    } catch { /* DB unreachable — report what we have */ }
  }

  // ── Build the places people are actually asking about ─────────────────────
  // Every trip question records its destination. Here we go and fetch those
  // cities — sights, events, food, outdoors — which write-throughs into the
  // database. The effect is that coverage grows toward where this app's users
  // are really going, instead of toward a hard-coded list of cities, and the
  // second person to ask about a place gets an instant answer.
  const origin = new URL(req.url).origin;
  const destinations = await topDestinations(6).catch(() => []);
  const warmed: { city: string; got: number }[] = [];
  const deadline = Date.now() + 38_000; // stay inside the Hobby function cap

  for (const d of destinations) {
    if (Date.now() > deadline) break;
    let got = 0;
    for (const cat of ['sightseeing', 'events', 'restaurants']) {
      if (Date.now() > deadline) break;
      got += (await gather(origin, d, cat, 12, { visiting: true }).catch(() => [])).length;
    }
    warmed.push({ city: d.city, got });
  }

  // Re-save so a healthy model refreshes its TTL and never quietly expires
  // during a quiet period.
  if (isUsable(model) && model.n > 0) await saveGlobalModel(model);

  return NextResponse.json({
    ok: true,
    model: { version: MODEL_VERSION, examplesSeen: model.n, trained: model.n >= 25, weights },
    sourceReliability: sources,
    corpus,
    destinations: { tracked: destinations.length, warmed },
    generatedAt: new Date().toISOString(),
  });
}
