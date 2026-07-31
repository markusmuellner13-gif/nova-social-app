import { describe, it, expect } from 'vitest';
import { parseTripQuery, buildTripBriefing, crowdAdvice } from './trip';
import { prominence, isChain, rankForVisitor } from './prominence';
import type { ApiPost } from '@/lib/sources/shared';

function post(o: Partial<ApiPost> = {}): ApiPost {
  return {
    id: 'wiki_1', user: { id: 'u', name: 'X', username: 'x', avatar: '', bio: '', followers: 0, following: 0, posts: 0, verified: true },
    image: 'https://upload.wikimedia.org/a.jpg',
    caption: 'The Pantheon is a former Roman temple\n\nA long description of the building and its history that goes on for a while.',
    likes: 0, comments: 0, category: 'sightseeing', hashtags: [], timestamp: 0,
    location: { name: 'Pantheon, Rome', lat: 41.8986, lng: 12.4769 },
    saved: false, liked: false, isEvent: false, isAIGenerated: false,
    organizer: 'Pantheon', eventUrl: 'https://en.wikipedia.org/wiki/Pantheon',
    ...o,
  };
}

describe('parseTripQuery — understanding a trip question', () => {
  it('reads destination and a relative future window', () => {
    const q = parseTripQuery("I'm going to Rome in three weeks, what should I see?");
    expect(q.isTrip).toBe(true);
    expect(q.destination?.toLowerCase()).toBe('rome');
    expect(q.inDays).toBe(21);
    expect(q.whenLabel).toBe('in 3 weeks');
  });

  it('handles numeric forms and multi-word cities', () => {
    const q = parseTripQuery('travelling to New York in 2 months — things to do?');
    expect(q.isTrip).toBe(true);
    expect(q.destination).toBe('New York');
    expect(q.inDays).toBe(60);
  });

  it('understands next week / next month / this weekend', () => {
    expect(parseTripQuery('going to Lisbon next week').inDays).toBe(7);
    expect(parseTripQuery('trip to Porto next month').inDays).toBe(30);
    expect(parseTripQuery('visiting Prague this weekend').inDays).toBe(0);
  });

  it('understands a named month', () => {
    const q = parseTripQuery('I will be in Barcelona in September, what is worth seeing?');
    expect(q.isTrip).toBe(true);
    expect(q.destination).toBe('Barcelona');
    expect(q.inDays).toBeGreaterThanOrEqual(0);
    expect(q.whenLabel).toBe('in September');
  });

  it('treats a planning question without a date as a trip', () => {
    const q = parseTripQuery('what is really worth seeing in Amsterdam?');
    expect(q.isTrip).toBe(true);
    expect(q.destination).toBe('Amsterdam');
  });

  it('does NOT hijack an ordinary local question', () => {
    expect(parseTripQuery("what's on tonight?").isTrip).toBe(false);
    expect(parseTripQuery('any live music this weekend?').isTrip).toBe(false);
    expect(parseTripQuery('free events nearby').isTrip).toBe(false);
  });

  it('does not mistake a verb or a month for a city', () => {
    expect(parseTripQuery('where to go tonight')?.destination).not.toBe('go');
    expect(parseTripQuery('what to do this weekend')?.destination).not.toBe('do');
    const q = parseTripQuery('anything in March?');
    expect(q.destination).not.toBe('March');
  });

  it('widens the window the further out the trip is', () => {
    expect(parseTripQuery('going to Rome in 3 days').spanDays).toBeLessThan(
      parseTripQuery('going to Rome in 3 months').spanDays
    );
  });
});

describe('prominence — worth going to, not merely near', () => {
  it('ranks a Wikipedia-backed landmark above an unremarkable pin', () => {
    const landmark = post();
    const pin = post({ id: 'osm_9', image: 'https://picsum.photos/seed/x/1/1', caption: 'Bar\n\nx', eventUrl: 'https://www.openstreetmap.org/node/9', organizer: 'Bar' });
    expect(prominence(landmark)).toBeGreaterThan(prominence(pin));
  });

  it('recognises international chains', () => {
    expect(isChain("McDonald's")).toBe(true);
    expect(isChain('KFC')).toBe(true);
    expect(isChain('Starbucks Reserve')).toBe(true);
    expect(isChain('Els Quatre Gats')).toBe(false);
  });

  it('demotes chains below independents — the Barcelona bug', () => {
    // Nearest-first put McDonald's at the top of "where to eat in Barcelona".
    const mcd = post({ id: 'osm_1', organizer: "McDonald's", caption: "McDonald's\n\nfast food", distanceKm: 0.1, image: 'https://picsum.photos/x', eventUrl: '' });
    const local = post({ id: 'osm_2', organizer: 'Els Quatre Gats', caption: 'Els Quatre Gats is a historic café\n\nA long description of this modernista institution in the Gothic Quarter.', distanceKm: 1.4, image: 'https://upload.wikimedia.org/q.jpg', eventUrl: 'https://4gats.com' });
    const ranked = rankForVisitor([mcd, local]);
    expect(ranked[0].organizer).toBe('Els Quatre Gats');
  });

  it('uses distance as a tie-breaker between equally notable places', () => {
    const near = post({ id: 'wiki_1', organizer: 'A', distanceKm: 0.5 });
    const far = post({ id: 'wiki_2', organizer: 'B', distanceKm: 9 });
    expect(rankForVisitor([far, near])[0].organizer).toBe('A');
  });
});

describe('crowdAdvice — derived, never invented', () => {
  it('names the busiest sights and offers real quieter alternatives', () => {
    const sights = [
      post({ id: 'wiki_1', organizer: 'Colosseum' }),
      post({ id: 'wiki_2', organizer: 'Pantheon' }),
      post({ id: 'wiki_3', organizer: 'Trevi Fountain' }),
      post({ id: 'wiki_4', organizer: 'Basilica di San Clemente' }),
      post({ id: 'wiki_5', organizer: 'Palazzo Massimo' }),
    ];
    const advice = crowdAdvice(sights).join(' ');
    expect(advice).toMatch(/Colosseum|Pantheon|Trevi/);
    expect(advice).toMatch(/quieter/i);
    expect(advice).toMatch(/morning|opening/i);
  });

  it('says something useful even with nothing to rank', () => {
    expect(crowdAdvice([]).length).toBeGreaterThan(0);
  });
});

describe('buildTripBriefing', () => {
  const base = {
    city: 'Rome', whenLabel: 'in 3 weeks', from: '2026-08-21', to: '2026-08-28',
    sights: [post({ id: 'wiki_1', organizer: 'Pantheon' }), post({ id: 'wiki_2', organizer: 'Colosseum' })],
    events: [post({ id: 'tm_1', isEvent: true, eventDateRaw: '2026-08-23', caption: 'Opera at Terme di Caracalla\n\nx', eventVenue: 'Terme di Caracalla, Rome' })],
    food: [post({ id: 'osm_1', organizer: 'Roscioli', category: 'restaurants' })],
    outdoors: [post({ id: 'osm_2', organizer: 'Villa Borghese', category: 'outdoors' })],
  };

  it('produces every section with real names', () => {
    const b = buildTripBriefing(base);
    expect(b).toContain('Rome');
    expect(b).toContain('in 3 weeks');
    expect(b).toMatch(/Worth seeing/);
    expect(b).toContain('Pantheon');
    expect(b).toMatch(/On while you're there/);
    expect(b).toContain('Opera at Terme di Caracalla');
    expect(b).toMatch(/Where to eat/);
    expect(b).toContain('Roscioli');
    expect(b).toMatch(/Avoiding the crowds/);
  });

  it('is honest when there are no events in the window', () => {
    const b = buildTripBriefing({ ...base, events: [] });
    expect(b).toMatch(/don't have confirmed listings/i);
    // and must NOT invent any
    expect(b).not.toContain('Opera at Terme di Caracalla');
  });

  it('excludes events outside the trip window', () => {
    const b = buildTripBriefing({
      ...base,
      events: [post({ id: 'tm_9', isEvent: true, eventDateRaw: '2027-01-10', caption: 'Way too far away\n\nx' })],
    });
    expect(b).not.toContain('Way too far away');
    expect(b).toMatch(/don't have confirmed listings/i);
  });

  it('keeps chains out of the food section', () => {
    const b = buildTripBriefing({
      ...base,
      food: [post({ id: 'osm_5', organizer: "McDonald's", category: 'restaurants' })],
    });
    expect(b).not.toMatch(/McDonald/);
  });

  it('omits sections it has no data for rather than padding them', () => {
    const b = buildTripBriefing({ ...base, food: [], outdoors: [] });
    expect(b).not.toMatch(/Where to eat/);
    expect(b).not.toMatch(/Green space/);
  });
});
