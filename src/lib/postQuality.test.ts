import { describe, it, expect } from 'vitest';
import { hasCoreContent, dropIncompletePosts } from './postQuality';

const good = {
  id: 'a',
  title: 'Rooftop party with a view',
  caption: 'Rooftop party with one of the best views in Vienna\n\n📅 Sat 8 Aug\n📍 Juwel Wien',
  category: 'events',
  location: { name: 'Juwel Wien, Wien', lat: 48.2, lng: 16.3 },
};

describe('hasCoreContent', () => {
  it('keeps a normal event post', () => {
    expect(hasCoreContent(good)).toBe(true);
  });

  it('rejects the blank card measured in production', () => {
    // Vienna feed, 2026-08-06: rendered 901px tall with no text and no image.
    expect(hasCoreContent({ id: 'blank', caption: '', category: '', location: null })).toBe(false);
  });

  it('rejects a post that can only name itself with a URL', () => {
    expect(hasCoreContent({
      id: 'u',
      title: 'https://allevents.in/org/feverup-vienna',
      caption: 'https://allevents.in/org/feverup-vienna',
      category: 'events',
      location: { name: '' },
    })).toBe(false);
  });

  it('rejects a post with no location — the app is location-first', () => {
    expect(hasCoreContent({ ...good, location: null, eventVenue: undefined })).toBe(false);
  });

  it('accepts eventVenue as the place when location has no name', () => {
    expect(hasCoreContent({ ...good, location: { name: '' }, eventVenue: 'Palais Coburg' })).toBe(true);
  });

  it('rejects a post with no category (unfilterable, unrankable)', () => {
    expect(hasCoreContent({ ...good, category: '' })).toBe(false);
  });

  it('keeps a photoless post — a designed cover is a valid card', () => {
    expect(hasCoreContent({ ...good, image: '' } as never)).toBe(true);
  });

  it('keeps a landmark whose only prose is its own name', () => {
    expect(hasCoreContent({
      id: 'w',
      title: 'Stephansdom',
      caption: '🏛️ Cathedral\n📍 Stephansdom, Vienna',
      category: 'sightseeing',
      location: { name: 'Stephansdom, Vienna' },
    })).toBe(true);
  });

  it('rejects a post that is nothing but metadata lines', () => {
    expect(hasCoreContent({
      id: 'm',
      caption: '📅 Sat 8 Aug\n📍 Somewhere\n🔗 Tickets: https://x.y',
      category: 'events',
      location: { name: 'Somewhere' },
    })).toBe(false);
  });
});

describe('dropIncompletePosts', () => {
  it('filters in place and preserves order', () => {
    const out = dropIncompletePosts([good, { id: 'blank', caption: '' }, { ...good, id: 'b' }]);
    expect(out.map((p) => p.id)).toEqual(['a', 'b']);
  });
  it('survives junk input', () => {
    expect(dropIncompletePosts([])).toEqual([]);
    expect(dropIncompletePosts(null as never)).toEqual([]);
  });
});
