import { describe, it, expect } from 'vitest';
import {
  slugify, haversineKm, withDistance, dedupePosts, dropExpired,
  proxyImage, picsumUrl, todayStr, type ApiPost,
} from './shared';

// Minimal ApiPost factory so tests stay readable.
function post(overrides: Partial<ApiPost> = {}): ApiPost {
  return {
    id: overrides.id ?? 'tm_1',
    user: { id: 'u', name: 'U', username: 'u', avatar: '', bio: '', followers: 0, following: 0, posts: 0, verified: false },
    image: '',
    caption: overrides.caption ?? 'Some Event\nsecond line',
    likes: 0, comments: 0,
    category: 'events',
    hashtags: [],
    timestamp: 0,
    location: overrides.location ?? { name: 'Venue', lat: 41.9, lng: 12.5 },
    saved: false, liked: false, isEvent: true, isAIGenerated: false,
    ...overrides,
  };
}

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('San Francisco')).toBe('san-francisco');
  });
  it('strips accents and punctuation', () => {
    expect(slugify('Málaga, España!')).toBe('malaga-espana');
  });
  it('trims leading/trailing hyphens', () => {
    expect(slugify('  --Hello--  ')).toBe('hello');
  });
});

describe('haversineKm', () => {
  it('is ~0 for identical points', () => {
    expect(haversineKm(41.9, 12.5, 41.9, 12.5)).toBeCloseTo(0, 5);
  });
  it('matches a known distance (Rome→Milan ≈ 477km)', () => {
    const d = haversineKm(41.9028, 12.4964, 45.4642, 9.19);
    expect(d).toBeGreaterThan(450);
    expect(d).toBeLessThan(500);
  });
});

describe('withDistance', () => {
  it('attaches a rounded distanceKm when coords exist', () => {
    const [p] = withDistance([post({ location: { name: 'V', lat: 45.4642, lng: 9.19 } })], 41.9028, 12.4964);
    expect(p.distanceKm).toBeGreaterThan(450);
    expect(p.distanceKm).toBeLessThan(500);
  });
  it('leaves posts without coords untouched', () => {
    const [p] = withDistance([post({ location: { name: 'V', lat: 0, lng: 0 } })], 41.9, 12.5);
    expect(p.distanceKm).toBeUndefined();
  });
});

describe('dedupePosts', () => {
  it('removes same-title same-date duplicates', () => {
    const a = post({ id: 'tm_1', caption: 'Coldplay Live', eventDateRaw: '2026-08-01' });
    const b = post({ id: 'eb_2', caption: 'Coldplay  Live!', eventDateRaw: '2026-08-01' });
    expect(dedupePosts([a, b])).toHaveLength(1);
  });
  it('keeps same title on different dates', () => {
    const a = post({ id: 'tm_1', caption: 'Coldplay Live', eventDateRaw: '2026-08-01' });
    const b = post({ id: 'tm_2', caption: 'Coldplay Live', eventDateRaw: '2026-08-02' });
    expect(dedupePosts([a, b])).toHaveLength(2);
  });
});

describe('dropExpired', () => {
  it('keeps undated posts', () => {
    expect(dropExpired([post({ eventDateRaw: null })])).toHaveLength(1);
  });
  it('drops past events and keeps today/future', () => {
    const past   = post({ id: 'p', eventDateRaw: '2000-01-01' });
    const future = post({ id: 'f', eventDateRaw: '2999-01-01' });
    const today  = post({ id: 't', eventDateRaw: todayStr() });
    const out = dropExpired([past, future, today]).map(p => p.id);
    expect(out).toContain('f');
    expect(out).toContain('t');
    expect(out).not.toContain('p');
  });
});

describe('proxyImage', () => {
  it('proxies rate-limited image hosts', () => {
    expect(proxyImage('https://images.unsplash.com/photo-1')).toMatch(/^\/api\/image-proxy\?url=/);
  });
  it('leaves other hosts (and empty) unchanged', () => {
    expect(proxyImage('https://s1.ticketm.net/x.jpg')).toBe('https://s1.ticketm.net/x.jpg');
    expect(proxyImage('')).toBe('');
  });
});

describe('picsumUrl', () => {
  it('produces a deterministic, sanitised seed url', () => {
    expect(picsumUrl('Rome Events!')).toBe('https://picsum.photos/seed/rome_events_/600/750');
  });
});
