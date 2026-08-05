import { describe, it, expect } from 'vitest';
import {
  isStandInImage, realImageUrl, imageIdentity, postsAreRelated, enforceRealImages,
} from './realImage';
import type { ApiPost } from './shared';

const post = (over: Partial<ApiPost> = {}): ApiPost => ({
  id: 'p1',
  user: {} as ApiPost['user'],
  image: 'https://venue.example/photo.jpg',
  caption: 'Some Place\n\nA description of the place.',
  likes: 0, comments: 0, category: 'food', hashtags: [],
  timestamp: 0, location: { name: 'Some Place, Rome', lat: 41.9, lng: 12.5 },
  saved: false, liked: false, isEvent: false, isAIGenerated: false,
  ...over,
});

describe('isStandInImage', () => {
  it('rejects every stock/filler host, including subdomains', () => {
    expect(isStandInImage('https://picsum.photos/seed/x/1440/1800')).toBe(true);
    expect(isStandInImage('https://images.unsplash.com/photo-1?w=1440')).toBe(true);
    expect(isStandInImage('https://source.unsplash.com/random')).toBe(true);
    expect(isStandInImage('https://images.pexels.com/photos/1/x.jpg')).toBe(true);
    expect(isStandInImage('https://ui-avatars.com/api/?name=AB')).toBe(true);
  });

  it('rejects anything that is not an absolute http(s) photo', () => {
    expect(isStandInImage('')).toBe(true);
    expect(isStandInImage(undefined)).toBe(true);
    expect(isStandInImage('/api/image-proxy?url=x')).toBe(true);
    expect(isStandInImage('data:image/png;base64,AAAA')).toBe(true);
  });

  it('accepts real photos of a subject', () => {
    expect(isStandInImage('https://upload.wikimedia.org/a/ab/Colosseum.jpg')).toBe(false);
    expect(isStandInImage('https://cdn.evbuc.com/images/1/original.jpg')).toBe(false);
    expect(isStandInImage('https://trattoria-roma.it/hero.jpg')).toBe(false);
  });

  it('realImageUrl blanks a stand-in and passes a real photo through', () => {
    expect(realImageUrl('https://picsum.photos/seed/x/1/1')).toBe('');
    expect(realImageUrl(' https://venue.it/a.jpg ')).toBe('https://venue.it/a.jpg');
  });
});

describe('imageIdentity', () => {
  it('treats the same photo requested at different sizes as one photo', () => {
    expect(imageIdentity('https://commons.wikimedia.org/wiki/Special:FilePath/X.jpg?width=1600'))
      .toBe(imageIdentity('https://commons.wikimedia.org/wiki/Special:FilePath/X.jpg?width=800'));
    expect(imageIdentity('https://cdn.x.io/a.jpg?w=1440&h=1800&fit=crop'))
      .toBe(imageIdentity('https://cdn.x.io/a.jpg?w=480'));
  });

  it('matches a Wikimedia thumb against its own original', () => {
    expect(imageIdentity('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/1280px-X.jpg'))
      .toBe(imageIdentity('https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg'));
  });

  it('keeps genuinely different photos apart', () => {
    expect(imageIdentity('https://cdn.x.io/a.jpg')).not.toBe(imageIdentity('https://cdn.x.io/b.jpg'));
  });
});

describe('postsAreRelated', () => {
  it('links the nights of one run by organiser and title', () => {
    const a = post({ id: 'e1', organizer: 'Wiener Konzerthaus', caption: 'Mahler 5\n\n…', eventDateRaw: '2026-08-06' });
    const b = post({ id: 'e2', organizer: 'Wiener Konzerthaus', caption: 'Mahler 5\n\n…', eventDateRaw: '2026-08-07' });
    expect(postsAreRelated(a, b)).toBe(true);
  });

  it('does not link two unrelated venues', () => {
    const a = post({ id: 'osm_1', organizer: 'Trattoria da Marco', location: { name: 'Trattoria da Marco, Rome', lat: 41.9, lng: 12.5 }, caption: 'Trattoria da Marco\n\n…' });
    const b = post({ id: 'osm_2', organizer: 'Café Größenwahn', location: { name: 'Café Größenwahn, Vienna', lat: 48.2, lng: 16.3 }, caption: 'Café Größenwahn\n\n…' });
    expect(postsAreRelated(a, b)).toBe(false);
  });

  it('normalises ß so one venue is not split in two', () => {
    const a = post({ id: 'a', organizer: 'Café Größenwahn' });
    const b = post({ id: 'b', organizer: 'Cafe Grossenwahn' });
    expect(postsAreRelated(a, b)).toBe(true);
  });
});

describe('enforceRealImages', () => {
  it('blanks stand-in photos instead of substituting another one', () => {
    const out = enforceRealImages([
      post({ id: 'a', image: 'https://picsum.photos/seed/a/1440/1800' }),
      post({ id: 'b', image: 'https://images.unsplash.com/photo-9?w=1440' }),
    ]);
    expect(out.map(p => p.image)).toEqual(['', '']);
  });

  it('leaves distinct real photos untouched', () => {
    const out = enforceRealImages([
      post({ id: 'a', image: 'https://x.io/1.jpg' }),
      post({ id: 'b', image: 'https://x.io/2.jpg', organizer: 'Other', location: { name: 'Other, Vienna', lat: 48, lng: 16 }, caption: 'Other\n\n…' }),
    ]);
    expect(out.map(p => p.image)).toEqual(['https://x.io/1.jpg', 'https://x.io/2.jpg']);
  });

  it('takes the photo off the UNRELATED post that reused it, keeping the first', () => {
    const out = enforceRealImages([
      post({ id: 'osm_1', organizer: 'Trattoria da Marco', location: { name: 'Trattoria da Marco, Rome', lat: 41.9, lng: 12.5 }, caption: 'Trattoria da Marco\n\n…', image: 'https://x.io/same.jpg' }),
      post({ id: 'osm_2', organizer: 'Beisl Wien', location: { name: 'Beisl Wien, Vienna', lat: 48.2, lng: 16.3 }, caption: 'Beisl Wien\n\n…', image: 'https://x.io/same.jpg' }),
    ]);
    expect(out[0].image).toBe('https://x.io/same.jpg');
    expect(out[1].image).toBe('');
  });

  it('lets related posts keep sharing one photo — a run of the same show', () => {
    const shared = 'https://x.io/artist.jpg';
    const out = enforceRealImages([
      post({ id: 'e1', organizer: 'Arena', caption: 'Nils Frahm Live\n\n…', image: shared, isEvent: true, eventDateRaw: '2026-08-06' }),
      post({ id: 'e2', organizer: 'Arena', caption: 'Nils Frahm Live\n\n…', image: shared, isEvent: true, eventDateRaw: '2026-08-07' }),
    ]);
    expect(out.map(p => p.image)).toEqual([shared, shared]);
  });

  it('catches a reuse hidden behind a different render size', () => {
    const out = enforceRealImages([
      post({ id: 'osm_1', organizer: 'Alpha', location: { name: 'Alpha, Rome', lat: 41, lng: 12 }, caption: 'Alpha\n\n…', image: 'https://x.io/p.jpg?w=1440&h=1800' }),
      post({ id: 'osm_2', organizer: 'Beta', location: { name: 'Beta, Oslo', lat: 59, lng: 10 }, caption: 'Beta\n\n…', image: 'https://x.io/p.jpg?w=480' }),
    ]);
    expect(out[1].image).toBe('');
  });

  it('promotes a surviving gallery frame when the lead photo is taken away', () => {
    const out = enforceRealImages([
      post({ id: 'osm_1', organizer: 'Alpha', location: { name: 'Alpha, Rome', lat: 41, lng: 12 }, caption: 'Alpha\n\n…', image: 'https://x.io/shared.jpg' }),
      post({
        id: 'osm_2', organizer: 'Beta', location: { name: 'Beta, Oslo', lat: 59, lng: 10 }, caption: 'Beta\n\n…',
        image: 'https://x.io/shared.jpg',
        images: ['https://x.io/shared.jpg', 'https://x.io/beta-own.jpg'],
      }),
    ]);
    expect(out[1].image).toBe('https://x.io/beta-own.jpg');
    expect(out[1].images).toBeUndefined(); // only one frame left — not a gallery
  });

  it('drops stand-ins out of a gallery too', () => {
    const out = enforceRealImages([
      post({ id: 'w1', image: 'https://picsum.photos/seed/z/1/1', images: ['https://picsum.photos/seed/z/1/1', 'https://upload.wikimedia.org/a/ab/Real.jpg'] }),
    ]);
    expect(out[0].image).toBe('https://upload.wikimedia.org/a/ab/Real.jpg');
  });
});
