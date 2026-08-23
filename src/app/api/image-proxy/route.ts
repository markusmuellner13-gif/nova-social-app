import { NextRequest, NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import sharp from 'sharp';
import { upgradeImageUrl } from '@/lib/imageUrl';
import {
  failureSpec, isPrivateAddress, isTransient, looksLikeImage, passthroughType,
  snapWidth, upstreamFailureKind, type ProxyFailure,
} from '@/lib/imageProxyPolicy';

// sharp is a native module — this route must run on Node, not the edge runtime.
export const runtime = 'nodejs';
// Two upstream attempts plus a cold AVIF render has to fit inside one
// invocation. Without this the platform's default ceiling could cut the
// function off mid-render, which surfaces as a gateway error nobody can trace
// back to a line of code.
export const maxDuration = 30;

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
//
// FAILURES ARE PART OF THE JOB. A feed is full of third-party photos, and some
// share of them are expired, hotlink-protected or simply slow. Every one of
// those used to leave here as a 502 with no cache headers, which meant (a) the
// logs read as "the gateway is broken" when nothing on our side was, and (b)
// every single viewer of a dead photo re-ran the whole fetch. So each failure
// now gets the status that is actually true (see `imageProxyPolicy.ts`) and a
// cache lifetime to match, and nothing thrown in here escapes as a crash.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_BYTES = 20 * 1024 * 1024;   // source cap (originals are large by design)
// A 20 MB file can still decode to billions of pixels. libvips would allocate
// for all of them and the function would be killed — which the platform reports
// as a bad gateway, indistinguishable from an upstream fault. Refuse instead.
const MAX_PIXELS = 80_000_000;
const PER_ATTEMPT_MS = 8_000;
const TOTAL_BUDGET_MS = 18_000;       // all network work, across every attempt
const MAX_REDIRECTS = 3;

// Hosts we always allow. Everything else is permitted only after passing the
// SSRF guard below — real venue photos legitimately come from a venue's own
// domain, so a fixed allowlist would throw most of them away.
// (The stock hosts that used to sit at the top of this list are gone — posts no
// longer carry stand-in photography, so nothing should be asking to proxy it.)
const TRUSTED_HOSTS = new Set([
  'upload.wikimedia.org', 'commons.wikimedia.org',
  's1.ticketm.net', 's4.ticketm.net', 'img.ticketmaster.com',
  'img.evbuc.com', 'cdn.evbuc.com',
  'cdn-ip.allevents.in', 'cdn-az.allevents.in',
  'ui-avatars.com', 'i.pravatar.cc',
  'maps.googleapis.com', 'lh3.googleusercontent.com',
]);

/**
 * Block requests that could reach our own network (SSRF).
 *
 * Three answers, not two: a host that resolves to a private address is a
 * settled 'blocked' we can cache for hours, while one we simply could not
 * resolve is a passing DNS failure. Collapsing the two would let one bad lookup
 * pin a perfectly good photo behind a cached 403.
 */
type HostVerdict = 'public' | 'private' | 'unresolved';

async function checkHost(hostname: string): Promise<HostVerdict> {
  if (TRUSTED_HOSTS.has(hostname)) return 'public';
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(hostname)) return 'private';
  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    return 'unresolved';
  }
  if (addrs.length === 0) return 'unresolved';
  return addrs.every(({ address, family }) => !isPrivateAddress(address, family))
    ? 'public' : 'private';
}

/** The failure a non-public verdict earns, or null when the host is fine. */
function hostFailure(verdict: HostVerdict): ProxyFailure | null {
  if (verdict === 'public') return null;
  return verdict === 'private' ? 'blocked' : 'upstream';
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

type Fetched =
  | { ok: true; bytes: Buffer; contentType: string }
  | { ok: false; kind: ProxyFailure };

/**
 * Fetch one candidate URL, following redirects by hand.
 *
 * `redirect: 'follow'` would hand the SSRF guard a URL we then never actually
 * request: a public host is free to redirect us at 169.254.169.254. Each hop is
 * re-checked here instead.
 */
async function load(start: URL, deadline: number): Promise<Fetched> {
  let current = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const budget = Math.min(PER_ATTEMPT_MS, deadline - Date.now());
    if (budget <= 0) return { ok: false, kind: 'timeout' };

    let res: Response;
    try {
      res = await fetch(current.toString(), {
        headers: upstreamHeaders(current),
        redirect: 'manual',
        // Not `next: { revalidate }`: an original is routinely larger than the
        // data cache's 2 MB ceiling, so the write was attempted and dropped on
        // every request. Our own response is what gets cached — for 30 days,
        // at the edge, by the headers in `body()`.
        cache: 'no-store',
        signal: AbortSignal.timeout(budget),
      });
    } catch (err) {
      return { ok: false, kind: isTimeout(err) ? 'timeout' : 'upstream' };
    }

    if (res.status >= 300 && res.status < 400) {
      void res.body?.cancel().catch(() => {});
      const location = res.headers.get('location');
      if (!location) return { ok: false, kind: 'gone' };
      let next: URL;
      try { next = new URL(location, current); } catch { return { ok: false, kind: 'gone' }; }
      if (next.protocol !== 'https:') return { ok: false, kind: 'blocked' };
      const blocked = hostFailure(await checkHost(next.hostname));
      if (blocked) return { ok: false, kind: blocked };
      current = next;
      continue;
    }

    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      return { ok: false, kind: upstreamFailureKind(res.status) };
    }

    const contentType = res.headers.get('Content-Type') ?? '';
    if (!looksLikeImage(contentType)) {
      void res.body?.cancel().catch(() => {});
      return { ok: false, kind: 'unusable' };
    }

    const declared = parseInt(res.headers.get('Content-Length') ?? '', 10);
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      void res.body?.cancel().catch(() => {});
      return { ok: false, kind: 'too-large' };
    }

    let bytes: Buffer | null;
    try {
      bytes = await readCapped(res, MAX_BYTES);
    } catch (err) {
      // The headers arrived and the body did not: a connection dropped
      // mid-download, or the attempt ran out its budget while streaming. Both
      // are the upstream's, and both are worth one retry — letting this throw
      // would have made it our 500 instead.
      return { ok: false, kind: isTimeout(err) ? 'timeout' : 'upstream' };
    }
    if (!bytes) return { ok: false, kind: 'too-large' };
    if (bytes.byteLength === 0) return { ok: false, kind: 'unusable' };
    return { ok: true, bytes, contentType };
  }

  return { ok: false, kind: 'gone' }; // redirect loop
}

function isTimeout(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

/**
 * Read the body, stopping the moment it exceeds the cap.
 *
 * `arrayBuffer()` would buffer the whole thing first — an upstream that sends
 * 500 MB without a Content-Length would take the function's memory with it, and
 * a killed function is a 502 that looks exactly like an upstream fault.
 */
async function readCapped(res: Response, max: number): Promise<Buffer | null> {
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.byteLength > max ? null : buf;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      void reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    return await handle(req);
  } catch (err) {
    // Nothing below is allowed to throw its way out of the route: an uncaught
    // error here is an opaque platform 502 plus a Sentry issue per request,
    // rather than one answer we can read.
    console.warn('[image-proxy] unhandled', (err as Error)?.message ?? err);
    return fail('internal', 'unhandled');
  }
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) return fail('bad-request', 'missing-url');

  const width = snapWidth(req.nextUrl.searchParams.get('w'));
  const accept = req.headers.get('accept') ?? '';

  // Ask the source for its best version first, then — if that variant turns out
  // not to exist — exactly what the source gave us.
  const upgraded = upgradeImageUrl(raw);
  const candidates = upgraded === raw ? [raw] : [upgraded, raw];
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  let failure: ProxyFailure = 'upstream';
  let failedHost = '';

  for (let i = 0; i < candidates.length; i++) {
    const target = parseTarget(candidates[i]);
    if (!(target instanceof URL)) { failure = target; continue; }

    const blocked = hostFailure(await checkHost(target.hostname));
    if (blocked) { failure = blocked; failedHost = target.hostname; continue; }

    let got = await load(target, deadline);

    // One retry, and only on the last candidate: a single dropped connection or
    // a slow origin used to end the whole request as a 502, and a feed screen
    // asks for four widths of the same photo at once, so one blip became four.
    if (!got.ok && isTransient(got.kind) && i === candidates.length - 1
        && deadline - Date.now() > 3_000) {
      got = await load(target, deadline);
    }

    if (got.ok) return render(got.bytes, width, accept);
    failure = got.kind;
    failedHost = target.hostname;
  }

  console.warn(`[image-proxy] ${failure} host=${failedHost || 'n/a'}`);
  return fail(failure, failure);
}

/** An absolute https URL, or the failure the caller's string earns. */
function parseTarget(candidate: string): URL | ProxyFailure {
  let url: URL;
  try { url = new URL(candidate); } catch { return 'bad-request'; }
  return url.protocol === 'https:' ? url : 'bad-request';
}

/** Re-encode at the requested width in the best format the client accepts. */
async function render(source: Buffer, width: number, accept: string): Promise<NextResponse> {
  const wantsAvif = accept.includes('image/avif');
  const wantsWebp = accept.includes('image/webp');

  try {
    // `withoutEnlargement` keeps us honest: we never fake detail that the
    // source does not have — a small original stays small rather than being
    // upscaled into mush.
    const pipeline = sharp(source, {
      animated: false,
      limitInputPixels: MAX_PIXELS,
      // Render what arrived rather than throwing on a truncated download: half
      // a photo on the card beats a blank frame and another upstream fetch.
      failOn: 'none',
    })
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
  } catch (err) {
    // Unsupported or exotic input (an oversized decode, a codec libvips lacks)
    // — pass the original bytes through, but typed from the bytes themselves.
    // Echoing the upstream's Content-Type is how `binary/octet-stream` reached
    // browsers that then refused to render it under `nosniff`.
    const type = passthroughType(source);
    if (!type) {
      console.warn('[image-proxy] render failed', (err as Error)?.message ?? err);
      return fail('unusable', 'render-failed');
    }
    return body(source, type);
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

/** The one place a request leaves here without a picture. */
function fail(kind: ProxyFailure, reason: string): NextResponse {
  const spec = failureSpec(kind);
  return new NextResponse(spec.message, {
    status: spec.status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': spec.cacheControl,
      // Which of the failure paths above answered, readable straight from
      // `curl -I` — the previous version returned a bare 502 for six different
      // causes and there was no way to tell them apart after the fact.
      'X-Proxy-Reason': reason,
    },
  });
}
