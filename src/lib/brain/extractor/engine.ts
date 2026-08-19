// ─────────────────────────────────────────────────────────────────────────────
// The engine: read a page with everything we know, and learn when we don't.
//
// Order of operations per page, and why:
//
//   1. LEARNED SKILLS FIRST, best score first. If this host taught us something
//      before, going straight to the known path is both the cheapest and the
//      most accurate read available.
//   2. BUILT-IN SKILLS. Cheap, precise, and they cover the well-behaved half of
//      the web (schema.org). Always run — a site can publish JSON-LD for its
//      events and app state for its tours, and we want both.
//   3. LEARN, only if 1+2 came back thin. Learning is the expensive path
//      (it searches the whole payload tree), so it is gated on actually needing
//      it, and its result is persisted so the cost is paid once per host.
//
// Every skill that ran gets rewarded or blamed with what it actually produced,
// which is what turns a one-off lucky parse into a durable, ranked skill set.
// ─────────────────────────────────────────────────────────────────────────────

import type { ExtractedRecord, ReadReport, RecordKind } from './types';
import { harvestPayloads } from './harvest';
import { readBuiltIns } from './dialects';
import { learnSkill, applySkill } from './learn';
import { hostOf, loadSkills, rememberSkill, reward } from './skillStore';
import { isUsableRecord } from './validate';

/** Below this many records we consider the page "not really read" and learn. */
const THIN = 3;

export interface ReadPageOptions {
  /** The URL the HTML came from — used for the host key and relative links. */
  url: string;
  /** What we expect to find; only a default for undated records. */
  kind?: RecordKind;
  /** Set false in tests, or for a host we don't want to teach the engine from. */
  allowLearning?: boolean;
}

export interface ReadPageResult {
  records: ExtractedRecord[];
  report: ReadReport;
}

/** Dedupe by name + date + host — the same tour appears in three carousels. */
function dedupe(records: ExtractedRecord[]): ExtractedRecord[] {
  const seen = new Set<string>();
  const out: ExtractedRecord[] = [];
  for (const r of records) {
    const key = `${r.name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 48)}|${(r.startDate ?? '').slice(0, 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Read one page. Never throws — a page we can't read yields zero records and
 * the caller moves on to the next source, which is how the crawler has always
 * behaved and must keep behaving.
 */
export async function readPage(html: string, opts: ReadPageOptions): Promise<ReadPageResult> {
  const { url, kind = 'attraction', allowLearning = true } = opts;
  const host = hostOf(url);
  const empty: ReadPageResult = { records: [], report: { host, records: 0, bySkill: {} } };
  if (!html || html.length < 200) return empty;

  try {
    const payloads = harvestPayloads(html);
    const bySkill: Record<string, number> = {};
    let records: ExtractedRecord[] = [];

    // 1 — what this host has already taught us.
    const learned = await loadSkills(host);
    for (const skill of learned) {
      const found = applySkill(skill, payloads, url);
      bySkill[skill.id] = found.length;
      records.push(...found);
      // Blame counts too: a skill that returns nothing on a page it should have
      // read is exactly what the score decay is for.
      await reward(host, skill.id, found.length);
    }

    // 2 — the skills we ship with.
    const builtIn = readBuiltIns(html, payloads, url);
    records.push(...builtIn.records);
    for (const [id, n] of Object.entries(builtIn.bySkill)) {
      bySkill[id] = (bySkill[id] ?? 0) + n;
    }

    records = dedupe(records.filter(isUsableRecord));

    // 3 — nothing worked; try to invent a reader for this format.
    let learnedNow;
    if (allowLearning && records.length < THIN) {
      const result = learnSkill(payloads, { host, baseUrl: url, kind });
      if (result) {
        await rememberSkill(result.skill);
        learnedNow = result.skill;
        bySkill[result.skill.id] = result.records.length;
        records = dedupe([...records, ...result.records.filter(isUsableRecord)]);
      }
    }

    return {
      records,
      report: { host, records: records.length, bySkill, learned: learnedNow },
    };
  } catch {
    return empty;
  }
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
};

/** Fetch + read in one call. Returns no records rather than throwing. */
export async function fetchAndRead(
  url: string, opts: { kind?: RecordKind; timeoutMs?: number; allowLearning?: boolean } = {},
): Promise<ReadPageResult> {
  const { timeoutMs = 7000 } = opts;
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { records: [], report: { host: hostOf(url), records: 0, bySkill: {} } };
    const html = await res.text();
    return await readPage(html, { url, kind: opts.kind, allowLearning: opts.allowLearning });
  } catch {
    return { records: [], report: { host: hostOf(url), records: 0, bySkill: {} } };
  }
}
