import { NextRequest, NextResponse } from 'next/server';
import { loadGlobalModel, saveGlobalModel } from '@/lib/brain/store';
import { trainBatch, EVENT_WEIGHTS } from '@/lib/brain/ranker';
import { FEATURE_COUNT } from '@/lib/brain/features';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/brain/feedback — this is where the shared model actually learns.
//
// The client sends already-extracted FEATURE VECTORS, never post ids, user ids
// or anything identifying: fifteen numbers describing "an event, 2km away,
// happening tomorrow, with a real photo, in a category this person likes" plus
// what the user did with it. That is enough to train the ranker and useless for
// tracking anyone, which is the point.
//
// Batched by the client (one request per ~20 interactions) so this is a cheap,
// occasional write rather than a per-tap round trip.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_BATCH = 100;

interface Sample { x: number[]; action: string }

export async function POST(req: NextRequest) {
  let body: { samples?: Sample[] };
  try {
    body = await req.json() as { samples?: Sample[] };
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 });
  }

  const samples = Array.isArray(body.samples) ? body.samples.slice(0, MAX_BATCH) : [];
  if (samples.length === 0) return NextResponse.json({ ok: true, trained: 0 });

  // Reject anything malformed rather than letting it poison the shared weights.
  const batch = samples.flatMap(s => {
    if (!Array.isArray(s.x) || s.x.length !== FEATURE_COUNT) return [];
    if (!s.x.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 10)) return [];
    const w = EVENT_WEIGHTS[s.action];
    if (w === undefined) return [];
    return [{ x: s.x, label: w > 0 ? 1 : 0, weight: Math.abs(w) }];
  });

  if (batch.length === 0) return NextResponse.json({ ok: true, trained: 0 });

  try {
    const model = await loadGlobalModel();
    const next = trainBatch(model, batch);
    await saveGlobalModel(next);
    return NextResponse.json({ ok: true, trained: batch.length, seen: next.n });
  } catch {
    // Learning is best-effort: never fail a user's session over it.
    return NextResponse.json({ ok: true, trained: 0 });
  }
}

/** GET returns the current shared weights so the client can rank locally. */
export async function GET() {
  const model = await loadGlobalModel();
  return NextResponse.json(model, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
  });
}
