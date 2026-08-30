import { describe, it, expect } from 'vitest';
import {
  failureSpec, isPrivateAddress, isTransient, looksLikeImage,
  passthroughType, snapWidth, upstreamFailureKind,
} from './imageProxyPolicy';

describe('upstreamFailureKind', () => {
  // The whole point of the change: a source saying "that photo is gone" is not
  // our gateway failing, and 502 was both wrong and uncacheable.
  it('treats a dead or forbidden image as gone, not as a gateway error', () => {
    for (const status of [400, 401, 403, 404, 410, 451]) {
      expect(upstreamFailureKind(status)).toBe('gone');
    }
  });
  it('keeps rate limits and 5xx as upstream problems worth retrying', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(upstreamFailureKind(status)).toBe('upstream');
    }
  });
});

describe('failureSpec', () => {
  it('answers a dead image with a cacheable 404', () => {
    const spec = failureSpec('gone');
    expect(spec.status).toBe(404);
    expect(spec.cacheControl).toMatch(/s-maxage=\d{3,}/); // CDN absorbs the repeats
  });
  it('answers a passing upstream fault with a 502 that expires quickly', () => {
    expect(failureSpec('upstream').status).toBe(502);
    expect(failureSpec('upstream').cacheControl).toContain('s-maxage=60');
  });
  it('separates a timeout from a broken upstream', () => {
    expect(failureSpec('timeout').status).toBe(504);
  });
  it('never caches an error of our own', () => {
    expect(failureSpec('internal').cacheControl).toBe('no-store');
  });
});

describe('isTransient', () => {
  it('retries only what nothing upstream decided', () => {
    expect(isTransient('upstream')).toBe(true);
    expect(isTransient('timeout')).toBe(true);
    expect(isTransient('gone')).toBe(false);
    expect(isTransient('blocked')).toBe(false);
    expect(isTransient('unusable')).toBe(false);
  });
});

describe('snapWidth', () => {
  it('snaps to the nearest width on the ladder', () => {
    expect(snapWidth('1080')).toBe(1080);
    expect(snapWidth('1300')).toBe(1440);
    expect(snapWidth('500')).toBe(480);
  });
  it('falls back for a missing or unparseable width', () => {
    expect(snapWidth(null)).toBe(1080);
    expect(snapWidth('wide')).toBe(1080);
  });
  it('never returns a width outside the ladder', () => {
    expect(snapWidth('999999')).toBe(1440);
    expect(snapWidth('-40')).toBe(480);
  });
});

describe('isPrivateAddress', () => {
  it('blocks the private and link-local ranges', () => {
    for (const a of ['10.0.0.1', '127.0.0.1', '172.16.9.9', '192.168.1.1', '169.254.169.254', '0.0.0.0']) {
      expect(isPrivateAddress(a, 4), a).toBe(true);
    }
  });
  it('blocks carrier-grade NAT', () => {
    expect(isPrivateAddress('100.64.0.1', 4)).toBe(true);
    expect(isPrivateAddress('100.127.255.255', 4)).toBe(true);
  });
  it('allows ordinary public addresses', () => {
    for (const a of ['1.1.1.1', '208.80.154.224', '100.128.0.1', '172.32.0.1']) {
      expect(isPrivateAddress(a, 4), a).toBe(false);
    }
  });
  it('blocks IPv6 loopback and unique-local', () => {
    for (const a of ['::1', 'fd00::1', 'fe80::1']) {
      expect(isPrivateAddress(a, 6), a).toBe(true);
    }
    expect(isPrivateAddress('2606:4700::1111', 6)).toBe(false);
  });
  it('sees through an IPv4 address wearing an IPv6 hat', () => {
    // The old check only looked at the `fc`/`fd`/`fe80` prefixes, so the
    // metadata endpoint written this way sailed straight through.
    expect(isPrivateAddress('::ffff:169.254.169.254', 6)).toBe(true);
    expect(isPrivateAddress('::ffff:a9fe:a9fe', 6)).toBe(true);
    expect(isPrivateAddress('::ffff:0a00:0001', 6)).toBe(true);
    expect(isPrivateAddress('::ffff:1.1.1.1', 6)).toBe(false);
  });
  it('refuses anything it cannot parse', () => {
    expect(isPrivateAddress('not-an-address', 4)).toBe(true);
  });
});

describe('looksLikeImage', () => {
  it('accepts the odd content types real CDNs serve JPEGs as', () => {
    expect(looksLikeImage('binary/octet-stream')).toBe(true);
    expect(looksLikeImage('application/octet-stream')).toBe(true);
    expect(looksLikeImage('image/jpeg')).toBe(true);
    expect(looksLikeImage('')).toBe(true);
  });
  it('rejects an error page or an API response', () => {
    expect(looksLikeImage('text/html; charset=utf-8')).toBe(false);
    expect(looksLikeImage('application/json')).toBe(false);
  });
});

describe('passthroughType', () => {
  const pad = (head: number[]) => Buffer.concat([Buffer.from(head), Buffer.alloc(16)]);

  it('names the format from the bytes, not from what upstream claimed', () => {
    expect(passthroughType(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(passthroughType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(passthroughType(pad([...Buffer.from('GIF89a')]))).toBe('image/gif');
  });
  it('recognises WEBP and AVIF by their container header', () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
    expect(passthroughType(webp)).toBe('image/webp');
    const avif = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif'), Buffer.alloc(8)]);
    expect(passthroughType(avif)).toBe('image/avif');
  });
  it('refuses to pass an SVG through', () => {
    // Same-origin SVG can carry script, and the app sends `nosniff` so that a
    // mislabelled response cannot become one. Real SVGs are rasterised by sharp
    // long before this path.
    expect(passthroughType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });
  it('refuses HTML and anything too short to identify', () => {
    expect(passthroughType(Buffer.from('<!doctype html><html></html>'))).toBeNull();
    expect(passthroughType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});
