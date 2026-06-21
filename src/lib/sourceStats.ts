// ─────────────────────────────────────────────────────────────────────────────
// Source-quality learning — a lightweight feedback loop that makes the ingestion
// engine smarter over time.
//
// Every ingest run records how many events each source produced and how many the
// validator rejected. Over days this builds a reliability score per source, which
// the engine uses to prioritise the sources that actually deliver good data and
// de-prioritise the ones that mostly return junk. It's real feedback-based
// learning (running statistics with decay) — not neural training.
//
// Persisted in Redis; no-ops gracefully when Upstash isn't configured.
// ─────────────────────────────────────────────────────────────────────────────

import { cacheGet, cacheSet } from '@/lib/serverCache';

interface SourceStat { accepted: number; rejected: number; runs: number; lastRun: number }

const KEY = (source: string) => `nova:srcstat:v1:${source.slice(0, 40)}`;
const TTL = 60 * 60 * 24 * 60; // 60 days

// Record the outcome of one source's contribution during an ingest run. Applies
// a gentle decay so the score tracks recent behaviour, not ancient history.
export async function recordSourceYield(source: string, accepted: number, rejected: number): Promise<void> {
  if (!source) return;
  const cur = (await cacheGet<SourceStat>(KEY(source))) ?? { accepted: 0, rejected: 0, runs: 0, lastRun: 0 };
  const decay = 0.92;
  const next: SourceStat = {
    accepted: Math.round(cur.accepted * decay + accepted),
    rejected: Math.round(cur.rejected * decay + rejected),
    runs: cur.runs + 1,
    lastRun: Date.now(),
  };
  await cacheSet(KEY(source), next, TTL);
}

// Reliability in [0,1]: share of a source's events that passed validation.
// Unknown / barely-seen sources return a neutral 0.5 so they still get tried.
export async function getSourceReliability(source: string): Promise<number> {
  const s = await cacheGet<SourceStat>(KEY(source));
  if (!s) return 0.5;
  const total = s.accepted + s.rejected;
  if (total < 8) return 0.5;
  return s.accepted / total;
}

// Order a list of sources best-first by learned reliability.
export async function rankSources(sources: string[]): Promise<string[]> {
  const scored = await Promise.all(sources.map(async s => [s, await getSourceReliability(s)] as const));
  return scored.sort((a, b) => b[1] - a[1]).map(([s]) => s);
}

export async function getAllSourceStats(sources: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(sources.map(async s => { out[s] = await getSourceReliability(s); }));
  return out;
}
