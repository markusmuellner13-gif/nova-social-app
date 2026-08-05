import { describe, it, expect } from 'vitest';
import { upgradeImageUrl, postImageUrl, postImageSrcSet, IMAGE_WIDTHS } from './imageUrl';

describe('upgradeImageUrl — Eventbrite', () => {
  // img.evbuc.com URLs are imgix-SIGNED (`&s=<md5>`), so the width cannot be
  // raised in place — it 403s. The unsigned full-resolution original is embedded
  // in the path, and cdn.evbuc.com serves it directly.
  it('unwraps the signed thumbnail to the full-size original', () => {
    const signed =
      'https://img.evbuc.com/https%3A%2F%2Fcdn.evbuc.com%2Fimages%2F1186875896%2F293776918425%2F1%2Foriginal.20260614-173414' +
      '?w=512&auto=format%2Ccompress&q=75&sharp=10&s=e0a7e5d036d7f908014d27fdeec7be7a';
    expect(upgradeImageUrl(signed)).toBe(
      'https://cdn.evbuc.com/images/1186875896/293776918425/1/original.20260614-173414'
    );
  });

  it('handles the cropped 283px variant too', () => {
    const cropped =
      'https://img.evbuc.com/https%3A%2F%2Fcdn.evbuc.com%2Fimages%2F1%2F2%2F3%2Foriginal.x' +
      '?crop=focalpoint&fit=crop&w=283&h=152&s=abc';
    expect(upgradeImageUrl(cropped)).toBe('https://cdn.evbuc.com/images/1/2/3/original.x');
  });

  it('leaves an img.evbuc URL alone when it wraps something unexpected', () => {
    const odd = 'https://img.evbuc.com/not-a-url?w=512';
    expect(upgradeImageUrl(odd)).toBe(odd);
  });
});

describe('upgradeImageUrl — allevents.in', () => {
  // The imgproxy processing options are unsigned, so we can ask for a bigger render.
  it('raises the imgproxy resize directive', () => {
    const u = 'https://cdn-ip.allevents.in/s/rs:fill:500:250/g:sm/sh:100/aHR0cHM6Ly9leGFtcGxl.avif';
    expect(upgradeImageUrl(u)).toBe(
      'https://cdn-ip.allevents.in/s/rs:fill:1440:1800/g:sm/sh:100/aHR0cHM6Ly9leGFtcGxl.avif'
    );
  });
  it('handles rs:fit as well as rs:fill', () => {
    expect(upgradeImageUrl('https://cdn-ip.allevents.in/s/rs:fit:500:250/x'))
      .toBe('https://cdn-ip.allevents.in/s/rs:fit:1440:1800/x');
  });
});

describe('upgradeImageUrl — Wikimedia', () => {
  // The old code blindly rewrote any width to 800px, which 400s whenever the
  // source file is narrower than that — silently killing sightseeing galleries.
  it('raises a small thumbnail to the 1280px render Wikipedia publishes', () => {
    expect(upgradeImageUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/F.JPG/330px-F.JPG'))
      .toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/F.JPG/1280px-F.JPG');
  });
  it('never shrinks a thumbnail that is already large', () => {
    const big = 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/F.JPG/2000px-F.JPG';
    expect(upgradeImageUrl(big)).toBe(big);
  });
  it('leaves a full-size (non-thumb) file untouched', () => {
    const orig = 'https://upload.wikimedia.org/wikipedia/commons/d/dd/F.JPG';
    expect(upgradeImageUrl(orig)).toBe(orig);
  });
  it('raises the Special:FilePath width used by OSM wikimedia_commons tags', () => {
    expect(upgradeImageUrl('https://commons.wikimedia.org/wiki/Special:FilePath/F.JPG?width=900'))
      .toContain('width=1600');
  });
});

describe('upgradeImageUrl — other hosts', () => {
  it('raises the Google Places photo cap', () => {
    expect(upgradeImageUrl('https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=r&key=k'))
      .toContain('maxwidth=1600');
  });
  // The stock hosts are no longer upgraded because posts no longer carry them —
  // `realImage.ts` strips stand-in photography before it reaches a card.
  it('passes unknown hosts, http and junk through unchanged', () => {
    expect(upgradeImageUrl('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
    expect(upgradeImageUrl('http://example.com/a.jpg')).toBe('http://example.com/a.jpg');
    expect(upgradeImageUrl('')).toBe('');
    expect(upgradeImageUrl('not a url')).toBe('not a url');
  });
});

describe('postImageUrl', () => {
  it('routes an absolute url through the sized proxy', () => {
    expect(postImageUrl('https://example.com/a.jpg', 1080))
      .toBe('/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fa.jpg&w=1080');
  });
  it('unwraps a legacy /api/image-proxy url instead of double-proxying', () => {
    const legacy = '/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fa.jpg';
    expect(postImageUrl(legacy, 720))
      .toBe('/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fa.jpg&w=720');
  });
  it('leaves empty input alone', () => {
    expect(postImageUrl('', 1080)).toBe('');
  });
});

describe('postImageSrcSet', () => {
  it('offers every ladder width with a w descriptor', () => {
    const set = postImageSrcSet('https://example.com/a.jpg');
    for (const w of IMAGE_WIDTHS) expect(set).toContain(`&w=${w} ${w}w`);
    expect(set.split(',').length).toBe(IMAGE_WIDTHS.length);
  });
  it('is empty for a non-remote source', () => {
    expect(postImageSrcSet('')).toBe('');
    expect(postImageSrcSet('data:image/png;base64,xx')).toBe('');
  });
});
