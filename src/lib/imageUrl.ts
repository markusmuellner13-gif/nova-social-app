// Highest-quality variant resolution + the client-side URL builder for post photos.
//
// Every feed source hands us whatever image URL its API happens to return, and
// most of them default to a *thumbnail*: Eventbrite serves a signed 283–512px
// crop, allevents.in a 500×250 banner, Wikipedia's REST summary a 330px thumb.
// Blown up into a full-bleed 4:5 card on a 3× phone (≈1290×1614 real pixels)
// those are 2.5–4.5× upscaled — which is exactly what makes a feed look cheap.
//
// `upgradeImageUrl` rewrites each known host's URL to the largest variant that
// host will actually serve; `postImageUrl` then routes it through our resizing
// proxy so the card gets a crisp, correctly-sized, modern-format image without
// shipping a 900 KB original down a phone connection.

/** Widths the proxy is allowed to render. Keep in sync with the API route. */
export const IMAGE_WIDTHS = [480, 720, 1080, 1440] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Per-host "give me the big one" rewrites
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Eventbrite: `img.evbuc.com/<url-encoded original>?w=283&…&s=<md5>`.
 * The size params are covered by the `s=` signature, so we cannot simply ask for
 * a bigger `w`(it 403s). The *original* is embedded in the path though, and
 * `cdn.evbuc.com` serves it unsigned at full resolution.
 */
function upgradeEventbrite(u: URL): string | null {
  if (u.hostname !== 'img.evbuc.com') return null;
  const inner = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (/^https:\/\/cdn\.evbuc\.com\//.test(inner)) return inner;
  return null;
}

/**
 * allevents.in runs an imgproxy in front of its banners:
 * `cdn-ip.allevents.in/s/rs:fill:500:250/g:sm/sh:100/<base64url of origin>`.
 * The processing options are unsigned (`/s/` is the option prefix, not a
 * signature), so we can simply ask for a bigger render.
 */
function upgradeAllEvents(u: URL): string | null {
  if (!/(^|\.)allevents\.in$/.test(u.hostname)) return null;
  if (!/\/rs:(fill|fit):\d+:\d+/.test(u.pathname)) return null;
  return u.origin + u.pathname.replace(/\/rs:(fill|fit):\d+:\d+/, '/rs:$1:1440:1800');
}

/**
 * Wikimedia thumbnails: `…/thumb/a/ab/File.jpg/330px-File.jpg`.
 * Ask for 1280px — the width Wikipedia's own srcset uses for 2× displays, so it
 * is reliably pre-rendered. Requesting an arbitrary larger width (the previous
 * blind `800px-` rewrite) 400s whenever the source file is smaller, which is why
 * sightseeing galleries were falling back to random stock photos.
 */
function upgradeWikimedia(u: URL): string | null {
  if (u.hostname !== 'upload.wikimedia.org') return null;
  const m = u.pathname.match(/^(.*\/thumb\/.+\/)(\d+)px-(.+)$/);
  if (!m) return null;
  const current = parseInt(m[2], 10);
  if (current >= 1280) return null; // already big enough — leave it alone
  return `${u.origin}${m[1]}1280px-${m[3]}`;
}

/** Commons `Special:FilePath/<file>?width=900` (OSM's `wikimedia_commons` tag). */
function upgradeCommonsFilePath(u: URL): string | null {
  if (u.hostname !== 'commons.wikimedia.org') return null;
  if (!u.pathname.includes('Special:FilePath')) return null;
  const w = parseInt(u.searchParams.get('width') ?? '0', 10);
  if (w >= 1600) return null;
  u.searchParams.set('width', '1600');
  return u.toString();
}

/** Google Places photo endpoint — `maxwidth` is a plain parameter. */
function upgradeGooglePlaces(u: URL): string | null {
  if (!/(^|\.)googleapis\.com$/.test(u.hostname)) return null;
  if (!u.pathname.includes('/place/photo')) return null;
  const w = parseInt(u.searchParams.get('maxwidth') ?? '0', 10);
  if (w >= 1600) return null;
  u.searchParams.set('maxwidth', '1600');
  return u.toString();
}

/** Unsplash / Pexels expose the render size directly in the query string. */
function upgradeStock(u: URL): string | null {
  if (u.hostname === 'images.unsplash.com') {
    if (parseInt(u.searchParams.get('w') ?? '0', 10) >= 1440) return null;
    u.searchParams.set('w', '1440');
    u.searchParams.set('h', '1800');
    u.searchParams.set('q', '85');
    return u.toString();
  }
  if (u.hostname === 'images.pexels.com') {
    if (parseInt(u.searchParams.get('w') ?? '0', 10) >= 1440) return null;
    u.searchParams.set('w', '1440');
    u.searchParams.set('h', '1800');
    return u.toString();
  }
  return null;
}

/** picsum's size lives in the path: `/seed/<s>/1080/1350`. */
function upgradePicsum(u: URL): string | null {
  if (u.hostname !== 'picsum.photos') return null;
  const m = u.pathname.match(/^(.*?)\/(\d+)\/(\d+)$/);
  if (!m || parseInt(m[2], 10) >= 1440) return null;
  return `${u.origin}${m[1]}/1440/1800`;
}

/**
 * Rewrite an image URL to the highest-resolution variant the source will serve.
 * Unknown hosts and already-large URLs are returned unchanged. Never throws.
 */
export function upgradeImageUrl(raw: string): string {
  if (!raw || !/^https:\/\//i.test(raw)) return raw;
  let u: URL;
  try { u = new URL(raw); } catch { return raw; }

  for (const fn of [
    upgradeEventbrite, upgradeAllEvents, upgradeWikimedia,
    upgradeCommonsFilePath, upgradeGooglePlaces, upgradeStock, upgradePicsum,
  ]) {
    try {
      const next = fn(new URL(u.toString()));
      if (next) return next;
    } catch { /* try the next rule */ }
  }
  return raw;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client-side URL builder
// ─────────────────────────────────────────────────────────────────────────────

/** Absolute app-origin prefix (empty on web, the hosted origin in native builds). */
function base(): string {
  return (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/+$/, '');
}

/**
 * URL for a post photo at a given render width, via the resizing proxy.
 * Already-proxied and relative URLs are passed through untouched.
 */
export function postImageUrl(src: string, width: number): string {
  if (!src) return src;
  if (src.startsWith('/api/image-proxy')) {
    // Legacy URL produced by an older ingest — re-point it at the sized proxy.
    try {
      const inner = new URLSearchParams(src.split('?')[1] ?? '').get('url');
      if (inner) src = inner;
    } catch { /* fall through */ }
  }
  if (!/^https?:\/\//i.test(src)) return src;
  return `${base()}/api/image-proxy?url=${encodeURIComponent(src)}&w=${width}`;
}

/** `srcset` covering 1×/2×/3× displays so the browser picks the right render. */
export function postImageSrcSet(src: string): string {
  if (!src) return '';
  const proxied = /^https?:\/\//i.test(src) || src.startsWith('/api/image-proxy');
  if (!proxied) return '';
  return IMAGE_WIDTHS.map(w => `${postImageUrl(src, w)} ${w}w`).join(', ');
}
