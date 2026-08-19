import { describe, it, expect } from 'vitest';
import {
  chooseNudge, nudgeScore, nudgeKind, rememberNudge, EMPTY_MEMORY, MIN_GAP_MS,
  type NudgeCandidate,
} from './inAppNudge';

const post = (over: Partial<NudgeCandidate> = {}): NudgeCandidate => ({
  id: 'p1', category: 'music', hasPhoto: true, isEvent: true, ...over,
});

const TOP = ['music', 'art', 'food'];
const at = (isoLocal: string) => new Date(isoLocal);
const dayFrom = (now: Date, days: number) =>
  new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);

describe('nudgeScore', () => {
  it('scores zero for a category the user has shown no interest in', () => {
    expect(nudgeScore(post({ category: 'pets' }), TOP)).toBe(0);
  });

  it('needs more than an interest match — a photoless undated place does not qualify', () => {
    const now = at('2026-09-10T12:00:00');
    expect(nudgeScore(post({ hasPhoto: false, isEvent: false, eventDateRaw: null }), TOP, now))
      .toBeLessThan(2);
  });

  it('ranks something on today above something next month', () => {
    const now = at('2026-09-10T12:00:00');
    const today = nudgeScore(post({ eventDateRaw: dayFrom(now, 0) }), TOP, now);
    const later = nudgeScore(post({ eventDateRaw: dayFrom(now, 30) }), TOP, now);
    expect(today).toBeGreaterThan(later);
  });

  it('never nudges about an event that already happened', () => {
    const now = at('2026-09-10T12:00:00');
    expect(nudgeScore(post({ eventDateRaw: dayFrom(now, -1) }), TOP, now)).toBe(0);
  });
});

describe('nudgeKind', () => {
  it('says tonight in the evening for something on today', () => {
    const now = at('2026-09-10T19:00:00');
    expect(nudgeKind(post({ eventDateRaw: dayFrom(now, 0) }), now)).toBe('tonight');
  });

  it('says today in the morning for the same event', () => {
    const now = at('2026-09-10T08:00:00');
    expect(nudgeKind(post({ eventDateRaw: dayFrom(now, 0) }), now)).toBe('today');
  });

  it('leans weekend on a Thursday for a dated event', () => {
    const now = at('2026-09-10T12:00:00');           // a Thursday
    expect(now.getDay()).toBe(4);
    expect(nudgeKind(post({ eventDateRaw: dayFrom(now, 2) }), now)).toBe('weekend');
  });

  it('falls back to nearby for an undated place', () => {
    expect(nudgeKind(post({ eventDateRaw: null, isEvent: false }), at('2026-09-08T12:00:00')))
      .toBe('nearby');
  });
});

describe('chooseNudge', () => {
  const now = at('2026-09-10T19:00:00');
  const base = { topCategories: TOP, memory: EMPTY_MEMORY, city: 'Vienna', locale: 'en', now };

  it('picks the strongest candidate and writes copy with no source text in it', () => {
    const decision = chooseNudge({
      ...base,
      candidates: [
        post({ id: 'weak', category: 'art', hasPhoto: false, eventDateRaw: dayFrom(now, 20) }),
        post({ id: 'strong', category: 'music', hasPhoto: true, eventDateRaw: dayFrom(now, 0) }),
      ],
    });
    expect(decision?.post.id).toBe('strong');
    expect(decision?.kind).toBe('tonight');
    // The whole message is built from locale + city + a count.
    expect(decision?.title).toContain('tonight');
    expect(decision?.body).toContain('Vienna');
  });

  it('writes in the user language, not the listing language', () => {
    const de = chooseNudge({ ...base, locale: 'de', candidates: [post({ eventDateRaw: dayFrom(now, 0) })] });
    expect(de?.title).toContain('Heute Abend');
    const ja = chooseNudge({ ...base, locale: 'ja', candidates: [post({ eventDateRaw: dayFrom(now, 0) })] });
    expect(ja?.title).toContain('今夜');
  });

  it('NEVER repeats a post it has already announced — the whole bug', () => {
    const candidates = [post({ id: 'seen-it', eventDateRaw: dayFrom(now, 0) })];
    const first = chooseNudge({ ...base, candidates });
    expect(first).not.toBeNull();

    // What the feed does after notifying: remember it. A remount re-reads this
    // from storage rather than starting from an empty ref.
    const memory = rememberNudge(EMPTY_MEMORY, 'seen-it', now.getTime() - MIN_GAP_MS - 1);
    expect(chooseNudge({ ...base, memory, candidates })).toBeNull();
  });

  it('stays quiet inside the minimum gap even for a great post', () => {
    const memory = { notified: ['other'], lastAt: now.getTime() - 60_000 };
    expect(chooseNudge({
      ...base, memory,
      candidates: [post({ id: 'great', eventDateRaw: dayFrom(now, 0) })],
    })).toBeNull();
  });

  it('returns null when nothing clears the bar', () => {
    expect(chooseNudge({
      ...base,
      candidates: [post({ id: 'meh', category: 'pets' }), post({ id: 'meh2', category: 'tech' })],
    })).toBeNull();
  });

  it('reports a count that is actually true', () => {
    const today = dayFrom(now, 0);
    const decision = chooseNudge({
      ...base,
      candidates: [
        post({ id: 'a', eventDateRaw: today }),
        post({ id: 'b', eventDateRaw: today }),
        post({ id: 'c', eventDateRaw: today }),
        post({ id: 'd', eventDateRaw: dayFrom(now, 14) }),
      ],
    });
    // Three things are on today; the fourth is a fortnight away and must not
    // be counted into "3 things on tonight".
    expect(decision?.count).toBe(3);
    expect(decision?.title).toContain('3');
  });
});

describe('rememberNudge', () => {
  it('keeps the memory bounded and most-recent-first', () => {
    let memory = EMPTY_MEMORY;
    for (let i = 0; i < 500; i++) memory = rememberNudge(memory, `p${i}`, i);
    expect(memory.notified.length).toBeLessThanOrEqual(400);
    expect(memory.notified[0]).toBe('p499');
    expect(memory.lastAt).toBe(499);
  });

  it('does not duplicate an id it already holds', () => {
    const once = rememberNudge(EMPTY_MEMORY, 'x', 1);
    const twice = rememberNudge(once, 'x', 2);
    expect(twice.notified.filter(id => id === 'x')).toHaveLength(1);
  });
});
