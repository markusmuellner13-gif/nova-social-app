import { describe, it, expect } from 'vitest';
import { demandCell, demandScore, interleaveByDemand, partitionByDemand, buildSweepQueue, type DemandMap } from './demand';

// ─────────────────────────────────────────────────────────────────────────────
// The ingest sweep used to treat all 80 cities equally, which measured out at
// one full refresh every ELEVEN DAYS — Melbourne refreshed as often as Vienna.
// These tests pin the two properties that make demand ordering safe to ship:
//
//   1. wanted places come first, and
//   2. unwanted places are never abandoned.
//
// (2) is the one worth protecting. A ranking that starves its tail turns a slow
// feed into a permanently empty one for any city that has not been discovered
// yet — and a city with no content is a city nobody will ever open, which makes
// the starvation self-fulfilling.
// ─────────────────────────────────────────────────────────────────────────────

const VIENNA = { lat: 48.2082, lng: 16.3738 };
const TOKYO  = { lat: 35.6762, lng: 139.6503 };

describe('demandCell', () => {
  it('puts anywhere in a city into the same ~11km cell', () => {
    // The work list holds city-centre coordinates; a real user is somewhere else
    // in the city. Both must land in the same bucket or nothing ever matches.
    expect(demandCell(48.2082, 16.3738)).toBe(demandCell(48.21, 16.37));
  });

  it('separates genuinely different places', () => {
    expect(demandCell(VIENNA.lat, VIENNA.lng)).not.toBe(demandCell(TOKYO.lat, TOKYO.lng));
  });
});

describe('demandScore', () => {
  const map: DemandMap = { [`${demandCell(VIENNA.lat, VIENNA.lng)}:events`]: 10 };

  it('scores a place people asked for', () => {
    expect(demandScore(map, VIENNA.lat, VIENNA.lng, 'events')).toBeGreaterThan(0);
  });

  it('scores an untouched place at zero', () => {
    expect(demandScore(map, TOKYO.lat, TOKYO.lng, 'events')).toBe(0);
  });

  it('counts a user who is near the city, not exactly at its centre', () => {
    // ~12km north of the centre — a different cell, caught by the 3x3 block.
    expect(demandScore(map, 48.32, 16.3738, 'events')).toBeGreaterThan(0);
  });

  it('lifts a city\'s OTHER categories, but less than the one asked for', () => {
    const asked = demandScore(map, VIENNA.lat, VIENNA.lng, 'events');
    const other = demandScore(map, VIENNA.lat, VIENNA.lng, 'music');
    expect(other).toBeGreaterThan(0);      // Vienna is obviously active
    expect(other).toBeLessThan(asked);     // but Events is what they opened
  });

  it('survives junk coordinates', () => {
    expect(demandScore(map, NaN, 16.37, 'events')).toBe(0);
    expect(demandScore({}, VIENNA.lat, VIENNA.lng, 'events')).toBe(0);
  });
});

describe('interleaveByDemand', () => {
  type Item = { id: number; hot: boolean };
  const make = (hotCount: number, coldCount: number): Item[] => [
    ...Array.from({ length: hotCount }, (_, i) => ({ id: i, hot: true })),
    ...Array.from({ length: coldCount }, (_, i) => ({ id: 1000 + i, hot: false })),
  ];
  const score = (it: Item) => (it.hot ? 1 : 0);

  it('puts wanted items first', () => {
    const out = interleaveByDemand(make(3, 10), score);
    expect(out.slice(0, 3).every(i => i.hot)).toBe(true);
  });

  it('NEVER drops an item — the list is a permutation, not a filter', () => {
    const input = make(7, 23);
    const out = interleaveByDemand(input, score);
    expect(out).toHaveLength(input.length);
    expect(new Set(out.map(i => i.id)).size).toBe(input.length);
  });

  it('guarantees the cold tail a share of every sweep', () => {
    // The starvation guard. With a 3:1 ratio, a 12-item prefix — about what one
    // sweep gets through — must contain real long-tail work, however much
    // popular content is queued ahead of it.
    const out = interleaveByDemand(make(500, 500), score);
    const coldInPrefix = out.slice(0, 12).filter(i => !i.hot).length;
    expect(coldInPrefix).toBeGreaterThanOrEqual(2);
  });

  it('moves the cold tail along between sweeps', () => {
    // Without a rotating cursor the same few cold items would take the cold
    // quota every single run, and the real tail would never be reached at all.
    const items = make(20, 40);
    const first  = interleaveByDemand(items, score, 0).filter(i => !i.hot)[0];
    const second = interleaveByDemand(items, score, 7).filter(i => !i.hot)[0];
    expect(first.id).not.toBe(second.id);
  });

  it('leaves the order untouched when nothing has been measured yet', () => {
    // A fresh Redis, or no traffic at all: the sweep must behave exactly as it
    // did before this feature existed.
    const items = make(0, 25);
    expect(interleaveByDemand(items, () => 0)).toEqual(items);
  });

  it('ranks by how much demand there is, not merely that there is some', () => {
    const items = [{ id: 1, hot: true }, { id: 2, hot: true }, { id: 3, hot: true }];
    const out = interleaveByDemand(items, it => it.id);   // 3 wanted most
    expect(out.map(i => i.id)).toEqual([3, 2, 1]);
  });

  it('handles the degenerate shapes without throwing', () => {
    expect(interleaveByDemand([], score)).toEqual([]);
    expect(interleaveByDemand(make(5, 0), score)).toHaveLength(5);
    expect(interleaveByDemand(make(0, 5), score)).toHaveLength(5);
  });

  it('INGEST_HOT_PER_COLD=0 restores pure round-robin', () => {
    const before = process.env.INGEST_HOT_PER_COLD;
    process.env.INGEST_HOT_PER_COLD = '0';
    const items = make(5, 5);
    expect(interleaveByDemand(items, score)).toEqual(items);
    if (before === undefined) delete process.env.INGEST_HOT_PER_COLD;
    else process.env.INGEST_HOT_PER_COLD = before;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSweepQueue — the scheduled path.
//
// The obvious design (one cursor walking a demand-ordered array) quietly throws
// the ranking away: a cursor at position 500 is not refreshing the wanted items
// at position 0, so they come round once per full sweep exactly like everything
// else. These tests pin the behaviour that makes two cursors worth the extra
// moving part.
// ─────────────────────────────────────────────────────────────────────────────
describe('buildSweepQueue', () => {
  const hot  = Array.from({ length: 6 },  (_, i) => `H${i}`);
  const cold = Array.from({ length: 40 }, (_, i) => `C${i}`);

  it('spends most of a run on wanted work, but never all of it', () => {
    const q = buildSweepQueue(hot, cold, 0, 0, 12);
    const h = q.filter(x => x.from === 'hot').length;
    expect(h).toBeGreaterThan(q.length / 2);       // majority wanted
    expect(q.length - h).toBeGreaterThan(0);        // tail still gets a share
  });

  it('WRAPS the wanted list, so popular cities come round in minutes', () => {
    // The whole point. Six wanted items and a 12-item run means each is
    // refreshed roughly twice per invocation, not once per full catalogue pass.
    const q = buildSweepQueue(hot, cold, 0, 0, 24);
    const seen = q.filter(x => x.from === 'hot').map(x => x.item);
    expect(new Set(seen).size).toBe(hot.length);   // every wanted item appears
    expect(seen.length).toBeGreaterThan(hot.length); // and more than once
  });

  it('resumes each list where that list left off, independently', () => {
    const first = buildSweepQueue(hot, cold, 0, 0, 12);
    const hotUsed  = first.filter(x => x.from === 'hot').length;
    const coldUsed = first.filter(x => x.from === 'cold').length;

    const second = buildSweepQueue(hot, cold, hotUsed, coldUsed, 12);
    // The cold list is long, so the next run must reach NEW long-tail items —
    // this is what stops the tail being permanently stuck at C0.
    const firstCold  = new Set(first.filter(x => x.from === 'cold').map(x => x.item));
    const secondCold = second.filter(x => x.from === 'cold').map(x => x.item);
    expect(secondCold.some(c => !firstCold.has(c))).toBe(true);
  });

  it('walks the whole cold list over enough runs, and comes back round', () => {
    const seen = new Set<string>();
    let c = 0;
    for (let run = 0; run < 60; run++) {
      const q = buildSweepQueue(hot, cold, 0, c, 12);
      for (const x of q) if (x.from === 'cold') seen.add(x.item);
      c += q.filter(x => x.from === 'cold').length;
    }
    expect(seen.size).toBe(cold.length);   // nothing abandoned
  });

  it('works before any demand exists — everything is cold', () => {
    const q = buildSweepQueue([], cold, 0, 0, 10);
    expect(q).toHaveLength(10);
    expect(q.every(x => x.from === 'cold')).toBe(true);
    expect(new Set(q.map(x => x.item)).size).toBe(10);   // no repeats yet
  });

  it('terminates on degenerate input instead of spinning', () => {
    expect(buildSweepQueue([], [], 0, 0, 10)).toEqual([]);
    expect(buildSweepQueue(hot, [], 0, 0, 8)).toHaveLength(8);
    expect(buildSweepQueue([], [], 0, 0, 0)).toEqual([]);
  });

  it('never returns more than asked for', () => {
    for (const take of [1, 2, 3, 7, 13]) {
      expect(buildSweepQueue(hot, cold, 0, 0, take)).toHaveLength(take);
    }
  });
});

describe('partitionByDemand', () => {
  it('splits and ranks, keeping every item', () => {
    const items = [{ n: 'a', s: 0 }, { n: 'b', s: 5 }, { n: 'c', s: 0 }, { n: 'd', s: 9 }];
    const { hot, cold } = partitionByDemand(items, i => i.s);
    expect(hot.map(h => h.n)).toEqual(['d', 'b']);   // wanted most first
    expect(cold.map(c => c.n)).toEqual(['a', 'c']);
    expect(hot.length + cold.length).toBe(items.length);
  });

  it('is all-cold when nothing has been measured', () => {
    const items = [{ n: 'a' }, { n: 'b' }];
    const { hot, cold } = partitionByDemand(items, () => 0);
    expect(hot).toEqual([]);
    expect(cold).toHaveLength(2);
  });
});
