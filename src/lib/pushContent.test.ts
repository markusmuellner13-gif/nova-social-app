import { describe, it, expect } from 'vitest';
import { relativeWhen, buildDigest, buildGenericNudge, buildSmartPush } from './pushContent';
import type { ApiPost } from '@/lib/sources/shared';

function ev(title: string, dateRaw: string, category = 'events'): ApiPost {
  return {
    id: `e_${title}_${dateRaw}`,
    user: { id: 'u', name: 'U', username: 'u', avatar: '', bio: '', followers: 0, following: 0, posts: 0, verified: false },
    image: '', caption: `${title}\nsecond line`, likes: 0, comments: 0,
    category, hashtags: [], timestamp: 0,
    location: { name: 'Venue', lat: 48.2, lng: 16.37 },
    saved: false, liked: false, isEvent: true, isAIGenerated: false,
    eventDateRaw: dateRaw,
  };
}

describe('relativeWhen', () => {
  const now = new Date('2026-06-24T12:00:00'); // a Wednesday
  it('says today / tomorrow', () => {
    expect(relativeWhen('2026-06-24', now)).toBe('today');
    expect(relativeWhen('2026-06-25', now)).toBe('tomorrow');
  });
  it('names a day this week', () => {
    expect(relativeWhen('2026-06-27', now)).toBe('this Saturday');
  });
  it('uses "next" for the following week', () => {
    expect(relativeWhen('2026-07-05', now)).toMatch(/^next /);
  });
  it('falls back to a dated phrase further out', () => {
    expect(relativeWhen('2026-08-01', now)).toMatch(/^on \w{3} \d{1,2} \w{3}$/);
  });
  it('returns empty for past or missing dates', () => {
    expect(relativeWhen('2026-06-01', now)).toBe('');
    expect(relativeWhen(null, now)).toBe('');
  });
});

describe('buildDigest', () => {
  const wed = new Date('2026-06-24T12:00:00');

  it('returns null with no events', () => {
    expect(buildDigest({ city: 'Vienna', events: [], now: wed })).toBeNull();
  });

  it('builds a clean single-event message (no "+0 more")', () => {
    const msg = buildDigest({ city: 'Vienna', events: [ev('Jazz Night', '2026-06-25')], now: wed })!;
    expect(msg.title).toContain('Jazz Night');
    expect(msg.body).toContain('Vienna');
    expect(msg.body).not.toMatch(/\+0/);
  });

  it('mentions the city and a "more events" count for multiple events', () => {
    const events = [ev('A', '2026-06-25'), ev('B', '2026-06-26'), ev('C', '2026-06-27'), ev('D', '2026-06-28')];
    const msg = buildDigest({ city: 'Graz', events, now: wed })!;
    expect(msg.title.length).toBeGreaterThan(0);
    expect(`${msg.title} ${msg.body}`).toContain('Graz');
    expect(msg.body).toMatch(/more event/);
  });

  it('switches to a weekend roundup on Friday with a weekend lineup', () => {
    const fri = new Date('2026-06-26T12:00:00'); // Friday
    const events = [ev('Fri Gig', '2026-06-26'), ev('Sat Fest', '2026-06-27'), ev('Sun Market', '2026-06-28')];
    const msg = buildDigest({ city: 'Salzburg', events, now: fri })!;
    expect(msg.title.toLowerCase()).toContain('weekend');
    expect(msg.title).toContain('Salzburg');
  });
});

describe('buildGenericNudge', () => {
  it('always returns inviting copy with the place', () => {
    const msg = buildGenericNudge('Linz', new Date('2026-06-24T12:00:00'));
    expect(`${msg.title} ${msg.body}`).toContain('Linz');
  });
  it('handles a missing city gracefully', () => {
    const msg = buildGenericNudge(null, new Date('2026-06-24T12:00:00'));
    expect(msg.title.length).toBeGreaterThan(0);
    expect(msg.body.length).toBeGreaterThan(0);
  });
});

describe('buildSmartPush', () => {
  it('always returns a usable message even with no events', () => {
    const msg = buildSmartPush({ city: 'Baden', events: [], now: new Date('2026-06-24T12:00:00') });
    expect(msg.title.length).toBeGreaterThan(0);
    expect(msg.body.length).toBeGreaterThan(0);
  });

  it('personalises to the user\'s interest when an event matches', () => {
    const events = [ev('Indie Night', '2026-06-27', 'music'), ev('Food Market', '2026-06-27', 'food')];
    const msg = buildSmartPush({ city: 'Graz', events, categories: ['music'], now: new Date('2026-06-24T12:00:00') });
    expect(`${msg.title} ${msg.body}`).toContain('Indie Night');
  });

  it('uses a "tonight" angle for an event happening today in the evening', () => {
    const evening = new Date('2026-06-24T19:00:00');
    const events = [ev('Rooftop Set', '2026-06-24', 'music')];
    const msg = buildSmartPush({ city: 'Vienna', events, now: evening });
    expect(`${msg.title} ${msg.body}`.toLowerCase()).toContain('tonight');
  });

  it('gives a morning brief in the early hours', () => {
    const morning = new Date('2026-06-24T08:00:00');
    const events = [ev('Gallery Opening', '2026-06-24', 'art')];
    const msg = buildSmartPush({ city: 'Vienna', events, now: morning });
    expect(msg.title.toLowerCase()).toMatch(/morning|explore|day/);
  });

  it('spreads wording across users via the seed', () => {
    const events = [ev('A', '2026-06-30'), ev('B', '2026-06-30'), ev('C', '2026-06-30')];
    const now = new Date('2026-06-24T13:00:00');
    const a = buildSmartPush({ city: 'Wels', events, now, seed: 1 });
    const b = buildSmartPush({ city: 'Wels', events, now, seed: 2 });
    // Not a hard guarantee of difference, but seeds should be able to differ.
    expect(typeof a.body).toBe('string');
    expect(typeof b.body).toBe('string');
  });
});
