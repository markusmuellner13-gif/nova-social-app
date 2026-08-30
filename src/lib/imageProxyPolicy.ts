// The decision logic behind /api/image-proxy, kept apart from the route so it
// can be tested without a network, a real image, or the sharp native module.
//
// The route's job is to turn "something went wrong upstream" into an HTTP answer
// of our own. Which answer matters more than it looks: /api/image-proxy is the
// single busiest route in the app (a scroll session is hundreds of requests), so
// a status that is both honest AND cacheable is the difference between one
// upstream fetch per dead photo per day and one per viewer per scroll.

import { IMAGE_WIDTHS } from './imageUrl';

/**
 * Why a proxy request could not be answered with a picture.
 *
 * `gone` and `upstream` are deliberately different things: a source that
 * answers "404, that photo no longer exists" is not a broken gateway, and
 * reporting it as one is what filled the logs with 502s that no code change
 * could ever fix.
 */
export type ProxyFailure =
  | 'bad-request'   // the caller's `url`/`w` params, not the upstream's fault
  | 'blocked'       // failed the SSRF guard
  | 'gone'          // upstream answered, and the answer was "no such image"
  | 'unusable'      // upstream answered with something that is not an image
  | 'too-large'     // over the source byte cap
  | 'upstream'      // upstream 5xx / connection refused / reset
  | 'timeout'       // upstream did not answer in time
  | 'internal';     // a bug on our side

export interface FailureSpec {
  status: number;
  message: string;
  cacheControl: string;
}

// A dead photo stays dead, so let the CDN answer for it rather than sending
// every viewer back to the origin. Six hours, not a month: a 403 from a
// hotlink-protected host can be fixed by a header change on our side, and a
// month-long negative cache would outlive the fix.
const CACHE_SETTLED = 'public, max-age=600, s-maxage=21600';
// A timeout or a 5xx is a passing condition — cache it just long enough to
// absorb the burst of retries from one feed screen, no longer.
const CACHE_TRANSIENT = 'public, max-age=0, s-maxage=60, stale-while-revalidate=60';

const FAILURES: Record<ProxyFailure, FailureSpec> = {
  'bad-request': { status: 400, message: 'Bad image request',   cacheControl: CACHE_SETTLED },
  blocked:       { status: 403, message: 'Host not allowed',    cacheControl: CACHE_SETTLED },
  // 404, not 502. The photo is genuinely not there; our gateway worked fine.
  // It is also the practical choice: Vercel's CDN caches 404s and does not
  // cache 5xx, so this is the only status that stops the repeat traffic.
  gone:          { status: 404, message: 'Image not available', cacheControl: CACHE_SETTLED },
  unusable:      { status: 415, message: 'Not an image',        cacheControl: CACHE_SETTLED },
  'too-large':   { status: 413, message: 'Image too large',     cacheControl: CACHE_SETTLED },
  upstream:      { status: 502, message: 'Upstream error',      cacheControl: CACHE_TRANSIENT },
  timeout:       { status: 504, message: 'Upstream timed out',  cacheControl: CACHE_TRANSIENT },
  internal:      { status: 500, message: 'Image proxy failed',  cacheControl: 'no-store' },
};

export function failureSpec(kind: ProxyFailure): FailureSpec {
  return FAILURES[kind] ?? FAILURES.internal;
}

/** Which of our failures an upstream HTTP status maps to. */
export function upstreamFailureKind(status: number): ProxyFailure {
  // 408/429 are "come back later", not "this image is gone".
  if (status === 408 || status === 429) return 'upstream';
  if (status >= 400 && status < 500) return 'gone';
  return 'upstream';
}

/** Worth a second attempt at the same URL? Only if nothing was decided upstream. */
export function isTransient(kind: ProxyFailure): boolean {
  return kind === 'upstream' || kind === 'timeout';
}

/** Requested width, snapped to the ladder so the CDN holds few variants per photo. */
export function snapWidth(param: string | null, fallback = 1080): number {
  const wanted = parseInt(param ?? '', 10);
  if (!Number.isFinite(wanted)) return fallback;
  return IMAGE_WIDTHS.reduce(
    (best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best),
    IMAGE_WIDTHS[0],
  );
}

/**
 * True for an address we must not fetch from — anything that could reach our own
 * network rather than the public internet.
 */
export function isPrivateAddress(address: string, family: number): boolean {
  const a = address.toLowerCase().trim();
  if (family === 6) {
    // `::ffff:10.0.0.1` and `::ffff:a00:1` are IPv4 wearing an IPv6 hat, and the
    // v6 prefix rules below say nothing about them.
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1], 4);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(a)) {
      const [, hi, lo] = a.split(':').slice(-3);
      const n = (parseInt(hi, 16) << 16) | parseInt(lo, 16);
      return isPrivateAddress(
        [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'), 4,
      );
    }
    if (a === '::1' || a === '::') return true;
    return a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80');
  }
  const [p, q] = a.split('.').map(Number);
  if (!Number.isFinite(p) || !Number.isFinite(q)) return true; // unparseable → refuse
  if (p === 0 || p === 10 || p === 127) return true;
  if (p === 172 && q >= 16 && q <= 31) return true;
  if (p === 192 && q === 168) return true;
  if (p === 169 && q === 254) return true;       // link-local / cloud metadata
  if (p === 100 && q >= 64 && q <= 127) return true; // carrier-grade NAT
  return false;
}

/**
 * Reject only what is definitely NOT an image. Several CDNs (cdn.evbuc.com among
 * them) serve perfectly good JPEGs as `binary/octet-stream`, so the content type
 * is a veto, never a requirement — sharp is the real arbiter.
 */
export function looksLikeImage(contentType: string): boolean {
  return !/^\s*(text\/|application\/(json|xml|javascript|xhtml))/i.test(contentType);
}

const MAGIC: [string, (b: Buffer) => boolean][] = [
  ['image/jpeg', b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/png',  b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['image/gif',  b => b.subarray(0, 4).toString('latin1') === 'GIF8'],
  ['image/webp', b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'],
  ['image/bmp',  b => b[0] === 0x42 && b[1] === 0x4d],
  ['image/x-icon', b => b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0],
];

/**
 * The content type to serve bytes we are passing through unrendered, read from
 * the bytes themselves rather than from what the upstream claimed.
 *
 * Returns null when the bytes are not a raster image we recognise — including
 * SVG, which we never pass through: an SVG served from our own origin can carry
 * script, and the app sends `X-Content-Type-Options: nosniff` precisely so a
 * mislabelled response cannot become one. sharp rasterises real SVGs long
 * before this, so nothing legitimate is lost.
 */
export function passthroughType(bytes: Buffer): string | null {
  if (bytes.byteLength < 12) return null;
  const ftyp = bytes.subarray(4, 8).toString('latin1');
  if (ftyp === 'ftyp') {
    const brand = bytes.subarray(8, 12).toString('latin1');
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
  }
  for (const [type, test] of MAGIC) if (test(bytes)) return type;
  return null;
}
