import { describe, it, expect } from 'vitest';
import { validateEventPost } from './eventValidation';
import type { ApiPost } from '@/lib/sources/shared';

const base = (o: Partial<ApiPost>): ApiPost => ({
  id: 'ef_1',
  user: { id: 'u', name: 'V', username: 'v', avatar: '', bio: '', followers: 0, following: 0, posts: 0, verified: true },
  image: '', caption: 'x', likes: 0, comments: 0, category: 'events', hashtags: [], timestamp: 0,
  location: { name: 'Loop, Wien', lat: 48.2, lng: 16.34 }, saved: false, liked: false,
  isEvent: true, isAIGenerated: false,
  eventDateRaw: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10), ...o,
});

describe('validateEventPost judges the real title', () => {
  it('a long description in the caption no longer fails "title-length"', () => {
    const description = 'Ein After-Work fuer alle, die koennen und wollen. '.repeat(6);
    const p = base({ title: 'Ingenieur:innen ohne Grenzen Kann&Will', caption: `${description}\n\nmore` });
    expect(p.caption.split('\n')[0].length).toBeGreaterThan(240);
    expect(validateEventPost(p).ok).toBe(true);
  });

  it('still rejects a post whose own title is junk', () => {
    expect(validateEventPost(base({ title: 'ab', caption: 'ab' })).ok).toBe(false);
  });

  it('falls back to the caption line for posts without a title', () => {
    expect(validateEventPost(base({ title: undefined, caption: 'Jazz Night at the Blue Room\n\nmore' })).ok).toBe(true);
  });
});
