// ─────────────────────────────────────────────────────────────────────────────
// Where learned skills live, and how they earn their place.
//
// A skill learned by one request is useless if the next request has to learn it
// again, so skills persist in Redis under `nova:brain:skill:<host>` and are
// shared by every user and every cron run. That is what makes the engine get
// better over time rather than merely being clever once.
//
// Reinforcement, deliberately simple and honest:
//   • every use is a TRIAL; a use that produced records is a WIN
//   • `score` is an EWMA of the per-trial yield, so recent behaviour dominates
//     and a site that redesigns its markup demotes its own stale skill quickly
//   • skills below the floor after enough trials are DROPPED, which is what
//     keeps a lucky-but-wrong skill from shadowing the built-ins forever
//
// Redis is optional. With no Redis the process-local map still works for the
// life of the instance — the engine degrades to "learns within a request",
// never to "crashes".
// ─────────────────────────────────────────────────────────────────────────────

import { cacheEnabled, cacheGet, cacheSet, cacheScanKeys } from '@/lib/serverCache';
import type { LearnedSkill } from './types';

const PREFIX = 'nova:brain:skill:';
/** Skills are cheap to relearn; 30 days keeps a redesigned site from rotting. */
const TTL_SECONDS = 30 * 24 * 3600;
/** Never keep more than this per host — the best few are all that matter. */
const MAX_PER_HOST = 5;
/** How fast the score follows recent evidence. */
const ALPHA = 0.3;
/** Below this after MIN_TRIALS, a skill is not pulling its weight. */
const DROP_SCORE = 0.15;
const MIN_TRIALS = 4;

/** Process-local mirror so a burst of fetches doesn't re-read Redis per page. */
const memory = new Map<string, { skills: LearnedSkill[]; at: number }>();
const MEMORY_TTL_MS = 60_000;

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return 'unknown'; }
}

function key(host: string): string { return `${PREFIX}${host}`; }

function sortSkills(skills: LearnedSkill[]): LearnedSkill[] {
  return [...skills].sort((a, b) => b.score - a.score);
}

/** Skills for a host, best first. Never throws. */
export async function loadSkills(host: string): Promise<LearnedSkill[]> {
  const cached = memory.get(host);
  if (cached && Date.now() - cached.at < MEMORY_TTL_MS) return cached.skills;

  let skills: LearnedSkill[] = [];
  if (cacheEnabled) {
    try {
      const stored = await cacheGet<LearnedSkill[]>(key(host));
      if (Array.isArray(stored)) skills = stored.filter(isSkill);
    } catch { /* Redis down — fall through to whatever we have in memory */ }
  }
  if (skills.length === 0 && cached) skills = cached.skills;
  const sorted = sortSkills(skills);
  memory.set(host, { skills: sorted, at: Date.now() });
  return sorted;
}

function isSkill(v: unknown): v is LearnedSkill {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<LearnedSkill>;
  return typeof s.id === 'string' && Array.isArray(s.path) && typeof s.fields === 'object'
      && typeof s.score === 'number' && typeof s.source === 'string';
}

async function persist(host: string, skills: LearnedSkill[]): Promise<void> {
  const trimmed = sortSkills(skills).slice(0, MAX_PER_HOST);
  memory.set(host, { skills: trimmed, at: Date.now() });
  if (!cacheEnabled) return;
  try { await cacheSet(key(host), trimmed, TTL_SECONDS); } catch { /* best effort */ }
}

/**
 * Add a newly learned skill, or merge it into the one it duplicates.
 * Re-learning the same path is evidence FOR that path, not a second skill.
 */
export async function rememberSkill(skill: LearnedSkill): Promise<void> {
  const skills = await loadSkills(skill.host);
  const existing = skills.find(s => s.id === skill.id);
  if (existing) {
    existing.fields = skill.fields;
    existing.lastUsed = Date.now();
    existing.trials += 1;
    existing.wins += 1;
    existing.score = existing.score + ALPHA * (skill.score - existing.score);
    await persist(skill.host, skills);
    return;
  }
  await persist(skill.host, [...skills, skill]);
}

/**
 * Credit (or blame) a skill for what it just produced.
 *
 * `records` is the count it returned on this page. Yield is squashed into 0..1
 * because the difference between 20 and 200 records says more about the page
 * than about the skill.
 */
export async function reward(host: string, skillId: string, records: number): Promise<void> {
  const skills = await loadSkills(host);
  const skill = skills.find(s => s.id === skillId);
  if (!skill) return;

  const observed = records > 0 ? Math.min(1, 0.4 + records / 20) : 0;
  skill.trials += 1;
  if (records > 0) skill.wins += 1;
  skill.score = skill.score + ALPHA * (observed - skill.score);
  skill.lastUsed = Date.now();

  const kept = skills.filter(s => !(s.trials >= MIN_TRIALS && s.score < DROP_SCORE));
  await persist(host, kept);
}

/** Everything the engine has learned — powers the /api/cron/brain self-report. */
export async function skillReport(maxHosts = 200): Promise<{
  hosts: number; skills: number;
  top: { host: string; id: string; score: number; trials: number; wins: number }[];
}> {
  if (!cacheEnabled) {
    const local = [...memory.entries()].flatMap(([host, v]) => v.skills.map(s => ({ ...s, host })));
    return {
      hosts: memory.size,
      skills: local.length,
      top: local.sort((a, b) => b.score - a.score).slice(0, 20)
        .map(s => ({ host: s.host, id: s.id, score: round(s.score), trials: s.trials, wins: s.wins })),
    };
  }
  let keys: string[] = [];
  try { keys = await cacheScanKeys(PREFIX, maxHosts); } catch { /* report degrades to empty */ }
  const all: LearnedSkill[] = [];
  for (const k of keys.slice(0, maxHosts)) {
    try {
      const skills = await cacheGet<LearnedSkill[]>(k);
      if (Array.isArray(skills)) all.push(...skills.filter(isSkill));
    } catch { /* skip this host */ }
  }
  return {
    hosts: keys.length,
    skills: all.length,
    top: all.sort((a, b) => b.score - a.score).slice(0, 20)
      .map(s => ({ host: s.host, id: s.id, score: round(s.score), trials: s.trials, wins: s.wins })),
  };
}

function round(n: number): number { return Math.round(n * 1000) / 1000; }

/** Test seam — drops the process-local mirror. Does not touch Redis. */
export function resetSkillMemory(): void { memory.clear(); }
