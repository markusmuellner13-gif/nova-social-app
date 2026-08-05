import { describe, it, expect } from 'vitest';
import { mergeUnique, mergeUpgrade } from '@/hooks/useAIFeed';
import { sameLabel, dedupeAddressParts } from '@/lib/sources/eventbrite';
import type { Post } from '@/types';

function post(o: Partial<Post> = {}): Post {
  return {
    id: 'eb_1',
    user: { id: 'u', name: 'V', username: 'v', avatar: '', bio: '', followers: 0, following: 0, posts: 0, verified: false },
    image: 'https://x.test/a.jpg',
    caption: 'Un viaje por el Perú\n\nfull description',
    likes: 0, comments: 0, category: 'events', hashtags: [], timestamp: 0,
    location: { name: 'Casa Mestiza, Wien', lat: 48.2, lng: 16.37 },
    saved: false, liked: false, isEvent: true, isAIGenerated: false,
    eventDateRaw: '2026-07-31',
    ...o,
  } as Post;
}

describe('mergeUnique — the duplicate-card fix', () => {
  it('drops the same event arriving under a different id', () => {
    // Exactly the bug seen in the feed: one Eventbrite event listed twice, so
    // the same card rendered twice and React warned about duplicate keys.
    const out = mergeUnique([post({ id: 'eb_1991865850378' })], [post({ id: 'eb_1991865850999' })]);
    expect(out).toHaveLength(1);
  });

  it('drops an exact id repeat', () => {
    expect(mergeUnique([post()], [post()])).toHaveLength(1);
  });

  it('keeps genuinely different events', () => {
    const out = mergeUnique([post()], [post({ id: 'eb_2', caption: 'Rooftop party\n\nx' })]);
    expect(out).toHaveLength(2);
  });

  it('keeps the same event on two different dates', () => {
    const out = mergeUnique([post()], [post({ id: 'eb_2', eventDateRaw: '2026-08-07' })]);
    expect(out).toHaveLength(2);
  });

  it('ignores accents and punctuation when comparing titles', () => {
    const a = post({ id: 'eb_1', caption: 'Café Größenwahn — Live!\n\nx' });
    const b = post({ id: 'eb_2', caption: 'Cafe Grossenwahn Live\n\nx' });
    expect(mergeUnique([a], [b])).toHaveLength(1);
  });

  it('returns the SAME array reference when nothing new arrived', () => {
    // React state identity matters here: returning a new array every time would
    // re-render the whole feed on every silent background refresh.
    const existing = [post()];
    expect(mergeUnique(existing, [post()])).toBe(existing);
  });

  it('preserves order and handles empty inputs', () => {
    const a = post({ id: 'eb_1' });
    const b = post({ id: 'eb_2', caption: 'B\n\nx' });
    expect(mergeUnique([a], [b]).map(p => p.id)).toEqual(['eb_1', 'eb_2']);
    expect(mergeUnique([], [])).toHaveLength(0);
    expect(mergeUnique([a], [])).toHaveLength(1);
  });

  it('dedupes within the incoming batch too', () => {
    const dup = post({ id: 'eb_9' });
    expect(mergeUnique([], [dup, post({ id: 'eb_10' })])).toHaveLength(1);
  });
});

describe('mergeUpgrade — the cold-start stream sends each card twice', () => {
  // The stream paints posts as soon as they are real, then sends them again with
  // photos attached. mergeUnique would call the second delivery a duplicate and
  // the feed would keep the photoless cards for good.
  it('replaces a photoless card with the finished one', () => {
    const early = post({ id: 'osm_1', image: '' });
    const withPhoto = post({ id: 'osm_1', image: 'https://x.test/real.jpg' });
    const out = mergeUpgrade([early], [withPhoto]);
    expect(out).toHaveLength(1);
    expect(out[0].image).toBe('https://x.test/real.jpg');
  });

  it('matches on content even when the id changed between deliveries', () => {
    const early = post({ id: 'osm_1', image: '' });
    const later = post({ id: 'db_77', image: 'https://x.test/real.jpg' });
    const out = mergeUpgrade([early], [later]);
    expect(out).toHaveLength(1);
    expect(out[0].image).toBe('https://x.test/real.jpg');
  });

  it('upgrades in place, so cards do not jump position', () => {
    const a = post({ id: 'a', caption: 'A\n\nx', image: '' });
    const b = post({ id: 'b', caption: 'B\n\nx', image: '' });
    const c = post({ id: 'c', caption: 'C\n\nx', image: '' });
    // The finished batch arrives in a different order than it was painted.
    const out = mergeUpgrade([a, b, c], [
      post({ id: 'c', caption: 'C\n\nx', image: 'https://x.test/c.jpg' }),
      post({ id: 'a', caption: 'A\n\nx', image: 'https://x.test/a.jpg' }),
      post({ id: 'b', caption: 'B\n\nx', image: 'https://x.test/b.jpg' }),
    ]);
    expect(out.map(p => p.id)).toEqual(['a', 'b', 'c']);
    expect(out.every(p => p.image !== '')).toBe(true);
  });

  it('appends posts the partial batch did not include', () => {
    const early = post({ id: 'osm_1', image: '' });
    const out = mergeUpgrade([early], [
      post({ id: 'osm_1', image: 'https://x.test/real.jpg' }),
      post({ id: 'osm_2', caption: 'Second\n\nx' }),
    ]);
    expect(out.map(p => p.id)).toEqual(['osm_1', 'osm_2']);
  });

  it('still drops genuine duplicates inside the appended remainder', () => {
    const out = mergeUpgrade([post({ id: 'a', caption: 'A\n\nx' })], [
      post({ id: 'b', caption: 'B\n\nx' }),
      post({ id: 'c', caption: 'B\n\nx' }), // same event, different id
    ]);
    expect(out).toHaveLength(2);
  });

  it('handles empty inputs without churn', () => {
    const existing = [post()];
    expect(mergeUpgrade(existing, [])).toBe(existing);
    expect(mergeUpgrade([], [])).toHaveLength(0);
    const incoming = [post()];
    expect(mergeUpgrade([], incoming)).toBe(incoming);
  });
});

describe('address tidying — the stuttering venue label', () => {
  it('matches labels across accents, case and ß', () => {
    expect(sameLabel('Grünbergstraße', 'Grunbergstrasse')).toBe(true);
    expect(sameLabel('Wien', 'wien')).toBe(true);
    expect(sameLabel('Wien', 'Graz')).toBe(false);
    expect(sameLabel('', 'Wien')).toBe(false);
  });

  it('stops "Grünbergstraße, Grünbergstraße, Wien"', () => {
    expect(dedupeAddressParts(['Grünbergstraße', 'Wien'], 'Grünbergstraße')).toBe('Wien');
  });

  it('keeps a genuine street + city pair', () => {
    expect(dedupeAddressParts(['2 Münzwardeingasse', 'Wien'], 'Casa Mestiza'))
      .toBe('2 Münzwardeingasse, Wien');
  });

  it('skips blanks and repeated parts', () => {
    expect(dedupeAddressParts([undefined, '  ', 'Wien', 'Wien'], undefined)).toBe('Wien');
  });
});
