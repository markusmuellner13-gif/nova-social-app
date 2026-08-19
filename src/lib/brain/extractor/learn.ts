// ─────────────────────────────────────────────────────────────────────────────
// Learning to read a site nobody wrote a reader for.
//
// Runs when the built-in skills come back empty or thin. The procedure:
//
//   1. Harvest every JSON payload in the page (harvest.ts).
//   2. Enumerate every ARRAY OF OBJECTS inside them, remembering the path.
//      Listings are arrays — that is the one structural assumption we make, and
//      it holds whether the site is Next.js, Nuxt, Rails or hand-rolled PHP.
//   3. For each candidate array, infer what its keys mean FROM THE VALUES
//      (infer.ts), so an unfamiliar vocabulary is no obstacle.
//   4. Build records, validate them, and score the candidate on how many rows
//      survived and how rich they were.
//   5. Keep the best candidate above the bar and return it as a LearnedSkill —
//      a small piece of JSON that lets us go straight to that path next time,
//      skipping the entire search.
//
// The bar matters more than the search. A skill that is wrong is worse than no
// skill, because it will be tried FIRST on every future fetch of that host —
// so a candidate has to clear both a row count and a quality floor, and the
// engine re-scores it on every use (see skillStore.reward).
// ─────────────────────────────────────────────────────────────────────────────

import type { ExtractedRecord, LearnedSkill, Payload, RecordKind } from './types';
import { inferFields, applyFields } from './infer';
import { toRecord } from './normalize';
import { batchQuality, isUsableRecord } from './validate';

/** Don't consider an array shorter than this — 2 rows can't establish a schema. */
const MIN_ROWS = 3;
/** A candidate must turn this fraction of its rows into usable records. */
const MIN_YIELD = 0.5;
/** …and the records must be at least this rich on average. */
const MIN_QUALITY = 0.25;
/** Search caps, so a pathological payload can't spin. */
const MAX_CANDIDATES = 120;
const MAX_DEPTH = 9;
const SAMPLE_ROWS = 25;

interface Candidate {
  source: Payload['source'];
  path: string[];
  rows: Record<string, unknown>[];
}

/** Every array-of-objects in a payload, with the path that reaches it. */
function findArrays(root: unknown, source: Payload['source'], out: Candidate[]): void {
  const visit = (value: unknown, path: string[], depth: number) => {
    if (!value || typeof value !== 'object' || depth > MAX_DEPTH || out.length >= MAX_CANDIDATES) return;

    if (Array.isArray(value)) {
      const objects = value.filter(
        (v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v),
      );
      // Rows of a listing share a schema; a tuple of unrelated objects doesn't.
      if (objects.length >= MIN_ROWS && objects.length / value.length > 0.8) {
        out.push({ source, path, rows: objects.slice(0, SAMPLE_ROWS) });
      }
      // Still descend — listings are routinely nested inside arrays of sections.
      for (let i = 0; i < Math.min(value.length, 12); i++) {
        visit(value[i], [...path, String(i)], depth + 1);
      }
      return;
    }

    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (out.length >= MAX_CANDIDATES) return;
      visit(v, [...path, k], depth + 1);
    }
  };
  visit(root, [], 0);
}

/** Run one candidate: infer its schema, build records, score the result. */
function evaluate(
  cand: Candidate, baseUrl: string | undefined, kind: RecordKind,
): { skill: Omit<LearnedSkill, 'host' | 'id' | 'createdAt' | 'lastUsed' | 'trials' | 'wins'>;
     records: ExtractedRecord[]; score: number } | null {
  const fields = inferFields(cand.rows);
  const mapped = Object.values(fields);
  // Without a name there is nothing to show, and without a second field the
  // "record" is just a list of strings.
  if (!mapped.includes('name') || mapped.length < 2) return null;

  const records: ExtractedRecord[] = [];
  for (const row of cand.rows) {
    const rec = toRecord(applyFields(row, fields), { kind, baseUrl, via: 'learned' });
    if (rec) records.push(rec);
  }

  const yieldRate = records.length / cand.rows.length;
  const quality = batchQuality(records);
  if (records.length < MIN_ROWS || yieldRate < MIN_YIELD || quality < MIN_QUALITY) return null;

  // Reward both "most of the rows worked" and "the rows were worth having",
  // with a mild preference for longer listings over a lucky 3-row match.
  const volume = Math.min(1, cand.rows.length / 12);
  const score = yieldRate * 0.4 + quality * 0.45 + volume * 0.15;

  const inferredKind = records.filter(r => r.kind === 'event').length > records.length / 2
    ? 'event' : kind;

  return {
    skill: { source: cand.source, path: cand.path, fields, kind: inferredKind, score },
    records,
    score,
  };
}

export interface LearnResult {
  skill: LearnedSkill;
  records: ExtractedRecord[];
}

/**
 * Try to learn a reader for this page. Returns null when nothing cleared the
 * bar — the honest and common outcome for a page that genuinely has no data in
 * it, and the reason a failed learn costs a few milliseconds rather than
 * polluting the skill set.
 */
export function learnSkill(
  payloads: Payload[], opts: { host: string; baseUrl?: string; kind?: RecordKind },
): LearnResult | null {
  const { host, baseUrl, kind = 'attraction' } = opts;

  const candidates: Candidate[] = [];
  for (const p of payloads) {
    // JSON-LD already has a precise built-in reader; learning a second way to
    // read it would just shadow the better one.
    if (p.source === 'ld+json') continue;
    findArrays(p.data, p.source, candidates);
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  if (candidates.length === 0) return null;

  let best: { skill: LearnResult['skill']; records: ExtractedRecord[]; score: number } | null = null;
  for (const cand of candidates) {
    const evaluated = evaluate(cand, baseUrl, kind);
    if (!evaluated) continue;
    if (!best || evaluated.score > best.score) {
      const now = Date.now();
      best = {
        skill: {
          ...evaluated.skill,
          host,
          id: `learned:${evaluated.skill.source}:${evaluated.skill.path.join('.') || 'root'}`,
          createdAt: now,
          lastUsed: now,
          trials: 1,
          wins: 1,
        },
        records: evaluated.records,
        score: evaluated.score,
      };
    }
  }
  return best ? { skill: best.skill, records: best.records } : null;
}

/**
 * Re-apply an already-learned skill. This is the fast path: no search, no
 * inference — walk straight to the known location and map the known keys.
 */
export function applySkill(
  skill: LearnedSkill, payloads: Payload[], baseUrl?: string,
): ExtractedRecord[] {
  const out: ExtractedRecord[] = [];
  for (const p of payloads) {
    if (p.source !== skill.source) continue;
    const target = walk(p.data, skill.path);
    if (!Array.isArray(target)) continue;
    for (const row of target) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const rec = toRecord(
        applyFields(row as Record<string, unknown>, skill.fields),
        { kind: skill.kind, baseUrl, via: skill.id },
      );
      if (rec && isUsableRecord(rec)) out.push(rec);
      if (out.length > 300) return out;
    }
  }
  return out;
}

function walk(root: unknown, path: string[]): unknown {
  let cur: unknown = root;
  for (const step of path) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = Array.isArray(cur)
      ? cur[Number(step)]
      : (cur as Record<string, unknown>)[step];
  }
  return cur;
}
