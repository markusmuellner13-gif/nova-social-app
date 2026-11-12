import { describe, it, expect } from 'vitest';
import { localToday, isEventOver, withoutEndedEvents, findEndedInteractions } from './expiry';

describe('localToday', () => {
  it('uses the local calendar day, not the UTC one', () => {
    // 00:30 local on the 13th — toISOString() would still say the 12th in any
    // timezone east of UTC. Built from local parts so it holds in every TZ.
    const d = new Date(2026, 10, 13, 0, 30);
    expect(localToday(d)).toBe('2026-11-13');
  });

  it('zero-pads month and day', () => {
    expect(localToday(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });
});

describe('isEventOver', () => {
  const today = '2026-11-12';

  it('an event dated before today is over', () => {
    expect(isEventOver({ eventDateRaw: '2026-11-11' }, today)).toBe(true);
  });

  it("today's event stays all day — we know the date, not the closing time", () => {
    expect(isEventOver({ eventDateRaw: '2026-11-12' }, today)).toBe(false);
  });

  it('future events are not over', () => {
    expect(isEventOver({ eventDateRaw: '2026-12-01' }, today)).toBe(false);
  });

  it('places and landmarks (no date) never expire', () => {
    expect(isEventOver({ eventDateRaw: undefined }, today)).toBe(false);
    expect(isEventOver({}, today)).toBe(false);
    expect(isEventOver(null, today)).toBe(false);
  });

  it('ignores a malformed date instead of guessing', () => {
    expect(isEventOver({ eventDateRaw: 'next friday' }, today)).toBe(false);
  });

  it('accepts a full timestamp by comparing its date part', () => {
    expect(isEventOver({ eventDateRaw: '2026-11-11T21:00:00' }, today)).toBe(true);
  });
});

describe('withoutEndedEvents', () => {
  it('keeps places and upcoming events, drops finished ones', () => {
    const posts = [
      { id: 'a', eventDateRaw: '2026-11-01' },
      { id: 'b', eventDateRaw: '2026-11-12' },
      { id: 'c' },
    ];
    expect(withoutEndedEvents(posts, '2026-11-12').map(p => p.id)).toEqual(['b', 'c']);
  });
});

describe('findEndedInteractions', () => {
  const snaps = [
    { id: 'past', eventDateRaw: '2026-10-01' },
    { id: 'soon', eventDateRaw: '2026-12-01' },
    { id: 'place' },
    { id: 'orphan-past', eventDateRaw: '2026-10-01' },
  ];

  it('returns only referenced posts whose event is over', () => {
    const ended = findEndedInteractions(snaps, ['past', 'soon', 'place'], '2026-11-12');
    expect([...ended]).toEqual(['past']);
  });

  it('never touches a snapshot nothing references', () => {
    expect(findEndedInteractions(snaps, ['soon'], '2026-11-12').size).toBe(0);
  });
});
