import { NextRequest, NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import sharp from 'sharp';
import { upgradeImageUrl, IMAGE_WIDTHS } from '@/lib/imageUrl';

// sharp is a native module — this route must run on Node, not the edge runtime.
export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// Nova's image pipeline.
//
// Feed sources hand us thumbnails (Eventbrite 283–512px, allevents 500×250,
// Wikipedia 330px). Rendered full-bleed on a 3× phone those are 2.5–4.5×
// upscaled — the single biggest reason a real-data feed can look cheap. This
// route fixes that end to end:
//
//   1. `upgradeImageUrl` swaps the URL for the largest variant the source serves
//      (Eventbrite's unsigned 4096px original, allevents' 1200px render, …).
//   2. sharp re-renders it at exactly the width the card needs, in AVIF/WebP.
//
// A 4096×2503 / 886 KB Eventbrite original becomes a 1440px-wide 44 KB AVIF:
// three times the detail for less bandwidth than the old thumbnail chain.
// Results are cached at the edge for a week, so each unique photo is processed
// once, not once per viewer.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_BYTES = 20 * 1024 * 1024; // source cap (originals are large by design)
const DEFAULT_WIDTH = 1080;

// Hosts we always allow. Everything else is permitted only after passing the
// SSRF guard below — real venue photos legitimately come from a venue's own
// domain, so a fixed allowlist would throw most of them away.
const TRUSTED_HOSTS = new Set([
  'images.unsplash.com', 'images.pexels.com', 'picsum.photos',
  'upload.wikimedia.org', 'commons.wikimedia.org',
  's1.ticketm.net', 's4.ticketm.net', 'img.ticketmaster.com',
  'img.evbuc.com', 'cdn.evbuc.com',
  'cdn-ip.allevents.in', 'cdn-az.allevents.in',
  'ui-avatars.com', 'i.pravatar.cc',
  'maps.googleapis.com', 'lh3.googleusercontent.com',
]);

/** Block requests that could reach our own network (SSRF). */
async function isPublicHost(hostname: string): Promise<boolean> {
  if (TRUSTED_HOSTS.has(hostname)) return true;
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(hostname)) return false;
  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    return false;
  }
  if (addrs.length === 0) return false;
  return addrs.every(({ address, family }) => {
    if (family === 6) {
      const a = address.toLowerCase();
      return !(a === '::1' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80'));
    }
    const [p, q] = address.split('.').map(Number);
    if (p === 10 || p === 127 || p === 0) return false;
    if (p === 172 && q >= 16 && q <= 31) return false;
    if (p === 192 && q === 168) return false;
    if (p === 169 && q === 254) return false;
    return true;
  });
}

/** Some CDNs only serve images to a request that looks like a real browser. */
function upstreamHeaders(target: URL): HeadersInit {
  const h: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/605.1.15 Nova/2.0 (+https://nova-phi-liart.vercel.app)',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  };
  // Wikimedia requires a descriptive UA and rejects generic browser strings.
  if (target.hostname.endsWith('wikimedia.org')) {
    h['User-Agent'] = 'Nova-App/2.0 (https://nova-phi-liart.vercel.app; contact@nova-app.com)';
  } else if (/allevents\.in$/.test(target.hostname)) {
    h.Referer = 'https://allevents.in/';
  } else if (/evbuc\.com$/.test(target.hostname)) {
    h.Referer = 'https://www.eventbrite.com/';
  }
  return h;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) return new NextResponse('Missing url param', { status: 400 });

  // Ask the source for its best version before we render it.
  const upgraded = upgradeImageUrl(raw);

  let target: URL;
  try {
    target = new URL(upgraded);
  } catch {
    return new NextResponse('Invalid URL', { status: 400 });
  }
  if (target.protocol !== 'https:') return new NextResponse('HTTPS only', { status: 400 });
  if (!(await isPublicHost(target.hostname))) return new NextResponse('Host not allowed', { status: 403 });

  // Requested render width, snapped to the allowed ladder so the edge cache has
  // a small, predictable set of variants per image.
  const wantedRaw = parseInt(req.nextUrl.searchParams.get('w') ?? '', 10);
  const width = Number.isFinite(wantedRaw)
    ? IMAGE_WIDTHS.reduce((best, w) => (Math.abs(w - wantedRaw) < Math.abs(best - wantedRaw) ? w : best), IMAGE_WIDTHS[0])
    : DEFAULT_WIDTH;

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: upstreamHeaders(target),
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
      next: { revalidate: 86400 },
    });
  } catch {
    return retryOriginal(raw, upgraded, width);
  }

  if (!upstream.ok) {
    // The upgraded variant may not exist (e.g. a Wikimedia thumb width that was
    // never rendered) — fall back to exactly what the source gave us.
    return retryOriginal(raw, upgraded, width);
  }

  // Don't insist on an `image/*` content type: several CDNs (cdn.evbuc.com among
  // them) serve perfectly good JPEGs as `binary/octet-stream`. Reject only what
  // is definitely NOT an image; sharp is the real arbiter below.
  const contentType = upstream.headers.get('Content-Type') ?? '';
  if (/^(text\/|application\/(json|xml|javascript))/i.test(contentType)) {
    return new NextResponse('Not an image', { status: 415 });
  }

  const declared = parseInt(upstream.headers.get('Content-Length') ?? '', 10);
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return new NextResponse('Image too large', { status: 413 });
  }

  const source = Buffer.from(await upstream.arrayBuffer());
  if (source.byteLength > MAX_BYTES) return new NextResponse('Image too large', { status: 413 });

  return render(source, width, req.headers.get('accept') ?? '', contentType);
}

/** Second chance with the untouched source URL when the upgraded one fails. */
async function retryOriginal(raw: string, upgraded: string, width: number): Promise<NextResponse> {
  if (raw === upgraded) return new NextResponse('Upstream error', { status: 502 });
  let target: URL;
  try { target = new URL(raw); } catch { return new NextResponse('Invalid URL', { status: 400 }); }
  if (target.protocol !== 'https:') return new NextResponse('HTTPS only', { status: 400 });
  if (!(await isPublicHost(target.hostname))) return new NextResponse('Host not allowed', { status: 403 });
  try {
    const res = await fetch(target.toString(), {
      headers: upstreamHeaders(target), redirect: 'follow',
      signal: AbortSignal.timeout(12_000), next: { revalidate: 86400 },
    });
    if (!res.ok) return new NextResponse('Upstream error', { status: res.status });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return new NextResponse('Image too large', { status: 413 });
    return render(buf, width, '', res.headers.get('Content-Type') ?? 'image/jpeg');
  } catch {
    return new NextResponse('Upstream fetch failed', { status: 502 });
  }
}

/** Re-encode at the requested width in the best format the client accepts. */
async function render(
  source: Buffer, width: number, accept: string, sourceType: string
): Promise<NextResponse> {
  const wantsAvif = accept.includes('image/avif');
  const wantsWebp = accept.includes('image/webp');

  try {
    // `withoutEnlargement` keeps us honest: we never fake detail that the
    // source does not have — a small original stays small rather than being
    // upscaled into mush.
    const pipeline = sharp(source, { animated: false })
      .rotate() // honour EXIF orientation
      .resize({ width, withoutEnlargement: true });

    // AVIF at q48 is roughly half the bytes of WebP at visually equal quality
    // (254 KB vs 461 KB on a 1440px photo), and `effort: 3` keeps the cold
    // render under a second — it only ever runs once per photo per width, since
    // every result is cached at the edge for a month.
    const out = wantsAvif
      ? await pipeline.avif({ quality: 48, effort: 3 }).toBuffer()
      : wantsWebp
        ? await pipeline.webp({ quality: 78 }).toBuffer()
        : await pipeline.jpeg({ quality: 84, mozjpeg: true }).toBuffer();

    return body(out, wantsAvif ? 'image/avif' : wantsWebp ? 'image/webp' : 'image/jpeg');
  } catch {
    // Unsupported/corrupt input (SVG, exotic codec) — pass the bytes through.
    return body(source, sourceType || 'image/jpeg');
  }
}

function body(buf: Buffer, type: string): NextResponse {
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': type,
      Vary: 'Accept',
      // Browser 1 day; CDN edge 30 days — each unique photo is rendered once.
      'Cache-Control': 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400, immutable',
    },
  });
}
