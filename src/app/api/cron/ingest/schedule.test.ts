import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { scheduleTier } from './schedule';

// ─────────────────────────────────────────────────────────────────────────────
// A Vercel cron can only call a plain path, so the two ingest schedules share
// one and identify themselves by the `x-vercel-cron-schedule` header. That makes
// a STRING in vercel.json load-bearing for which categories get refreshed — and
// a string match that silently stops matching is exactly the kind of failure
// that goes unnoticed for weeks (see the 2026-08-06 note in ingest.yml).
//
// So this reads the real vercel.json and checks the two stay in step.
// ─────────────────────────────────────────────────────────────────────────────

const vercelJson = JSON.parse(readFileSync(new URL('../../../../../vercel.json', import.meta.url), 'utf8')) as {
  crons: { path: string; schedule: string }[];
};

const ingestCrons = vercelJson.crons.filter(c => c.path === '/api/cron/ingest');

describe('ingest cron schedules', () => {
  it('vercel.json actually schedules the ingest route', () => {
    expect(ingestCrons.length).toBeGreaterThanOrEqual(2);
  });

  it('exactly one ingest schedule maps to the fast tier', () => {
    const fast = ingestCrons.filter(c => scheduleTier(c.schedule) === 'fast');
    expect(fast).toHaveLength(1);
  });

  it('the fast schedule is the FREQUENT one', () => {
    // If these ever swapped, the time-sensitive categories would be refreshed
    // every four hours and the museums every ten minutes — a bug that would look
    // like "the app is just slow" rather than like a misconfiguration.
    const fast = ingestCrons.find(c => scheduleTier(c.schedule) === 'fast')!;
    expect(fast.schedule).toMatch(/^\*\/\d+ \* \* \* \*$/);
  });

  it('every other ingest schedule falls back to the full catalogue', () => {
    for (const c of ingestCrons) {
      if (c.schedule === ingestCrons.find(x => scheduleTier(x.schedule) === 'fast')!.schedule) continue;
      expect(scheduleTier(c.schedule)).toBeNull();
    }
  });
});

describe('scheduleTier', () => {
  it('falls back to the full catalogue for anything unrecognised', () => {
    // The safe direction: editing vercel.json without touching the map degrades
    // to "sweeps everything, less often", never to "sweeps nothing".
    expect(scheduleTier('0 0 * * *')).toBeNull();
    expect(scheduleTier('')).toBeNull();
    expect(scheduleTier(null)).toBeNull();
    expect(scheduleTier('nonsense')).toBeNull();
  });

  it('tolerates surrounding whitespace from the header', () => {
    const fast = ingestCrons.find(c => scheduleTier(c.schedule) === 'fast')!;
    expect(scheduleTier(` ${fast.schedule} `)).toBe('fast');
  });
});
