import { describe, it, expect } from 'vitest';
import { mergeUnique } from '@/hooks/useAIFeed';
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
