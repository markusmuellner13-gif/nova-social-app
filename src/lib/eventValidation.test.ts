import { describe, it, expect } from 'vitest';
import { validateEventPost, validateBatch } from './eventValidation';
import type { ApiPost } from './sources/shared';

function makePost(over: Partial<ApiPost> = {}): ApiPost {
  const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  return {
    id: 'x1', user: {} as ApiPost['user'], image: 'https://img/x.jpg',
    caption: 'Great Concert Tonight\n\n📅 soon', likes: 0, comments: 0,
    category: 'music', hashtags: [], timestamp: Date.now(),
    location: { name: 'Venue, Vienna', lat: 48.2, lng: 16.37 },
    saved: false, liked: false, isEvent: true, isAIGenerated: false,
    eventDateRaw: future, ...over,
  };
}

describe('validateEventPost', () => {
  it('accepts a clean future event', () => {
    expect(validateEventPost(makePost()).ok).toBe(true);
  });

  it('rejects past events', () => {
    const r = validateEventPost(makePost({ eventDateRaw: '2000-01-01' }));
    expect(r.ok).toBe(false); expect(r.reason).toBe('past');
  });

  it('rejects null-island coordinates', () => {
    const r = validateEventPost(makePost({ location: { name: 'x', lat: 0, lng: 0 } }));
    expect(r.ok).toBe(false); expect(r.reason).toBe('null-island');
  });

  it('rejects spam captions', () => {
    const r = validateEventPost(makePost({ caption: 'Casino bonus free money click here now' }));
    expect(r.ok).toBe(false);
  });

  it('rejects junk/placeholder titles', () => {
    expect(validateEventPost(makePost({ caption: 'untitled\n\nx' })).ok).toBe(false);
  });

  it('rejects corrupt encoding', () => {
    expect(validateEventPost(makePost({ caption: 'Caf� night\n\nx' })).ok).toBe(false);
  });

  it('rejects events too far from the city when maxKm set', () => {
    const r = validateEventPost(makePost(), { cityLat: 48.2, cityLng: 16.37, maxKm: 50 });
    expect(r.ok).toBe(true);
    const far = validateEventPost(makePost({ location: { name: 'x', lat: 40, lng: -3 } }), { cityLat: 48.2, cityLng: 16.37, maxKm: 50 });
    expect(far.ok).toBe(false); expect(far.reason).toBe('mislocated');
  });

  it('rejects implausibly far-future placeholder dates', () => {
    const r = validateEventPost(makePost({ eventDateRaw: '2099-01-01' }));
    expect(r.ok).toBe(false); expect(r.reason).toBe('too-far-ahead');
  });
});

describe('validateBatch', () => {
  it('keeps valid, drops invalid, de-dupes', () => {
    const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const a = makePost({ id: 'a', caption: 'Jazz Evening\n\nx', eventDateRaw: future });
    const dup = makePost({ id: 'b', caption: 'Jazz Evening\n\ny', eventDateRaw: future });
    const bad = makePost({ id: 'c', eventDateRaw: '1999-01-01' });
    const { valid, rejected } = validateBatch([a, dup, bad]);
    expect(valid).toHaveLength(1);
    expect(rejected).toBe(2);
  });
});
