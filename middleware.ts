import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ─────────────────────────────────────────────────────────────────────────────
// Edge firewall + tiered rate limiting for every /api/* route.
//
// WHY: the cost-bearing endpoints (/api/feed, /api/chat, /api/events) call paid
// third-party APIs (Ticketmaster, Anthropic) and /api/business/checkout creates
// Stripe sessions. Without per-IP limits a single client can run up the bill or
// DoS the app. Each route class gets its own budget; the AI routes are tightest.
//
// Redis-backed (Upstash) when configured → limits persist across all serverless
// instances and survive cold starts. Without keys, falls back to a per-instance
// in-memory limiter (good enough for dev / low traffic).
//
// Webhooks (/api/business/webhook) and crons (/api/cron/*) are EXCLUDED from IP
// rate limiting — they authenticate by Stripe signature / CRON_SECRET and are
// hit from rotating provider IPs, so IP throttling would wrongly block them.
// ─────────────────────────────────────────────────────────────────────────────

type Tier = 'auth' | 'login' | 'ai' | 'write' | 'read' | 'asset';

// Requests allowed per minute, per IP, per tier.
const TIER_LIMITS: Record<Tier, number> = {
  // Endpoints guarded by a shared secret (/api/admin/*). The secret is the only
  // thing between the internet and cache purges / diagnostics, so the sole
  // defence against guessing it must not be the same 15/min a checkout gets.
  // 5/min turns even an optimistic online search into millions of years.
  auth:  5,
  // /api/auth/* — the Supabase credential endpoints, proxied through this origin
  // precisely so they land here (see src/lib/authProxy.ts). Before that they went
  // browser → supabase.co and middleware never saw a single login attempt.
  //
  // 20/min is deliberately not tighter: carrier-grade NAT puts thousands of real
  // users behind one address, and a per-IP limit strict enough to stop a botnet
  // would lock out an entire mobile network. The per-IP limit here is the blunt
  // instrument; the sharp one is the per-ACCOUNT exponential backoff inside the
  // route, which tracks the account being attacked rather than the IP doing it.
  login: 20,
  ai:    20,   // /api/chat, /api/feed, /api/events — paid upstreams
  write: 15,   // /api/business/checkout, /api/account/*, /api/push/* — mutations
  read:  60,   // /api/geocode, /api/track, /api/sponsored — cheap
  // /api/image-proxy serves the photos themselves: one feed screen is dozens of
  // requests and a scroll session is hundreds, all idempotent and served from the
  // CDN after the first hit. The read tier's 60/min would throttle a normal user's
  // own images, so assets get their own generous ceiling — still bounded, so the
  // endpoint can't be used as an open resizing service.
  asset: 600,
};

const WINDOW_MS = 60_000; // 1 minute

// Paths that bypass IP rate limiting entirely (own auth, provider IPs).
function isExcluded(pathname: string): boolean {
  return (
    pathname.startsWith('/api/cron/') ||
    pathname === '/api/business/webhook'
  );
}

function tierFor(pathname: string): Tier {
  if (pathname.startsWith('/api/admin')) return 'auth';
  // Must be checked before the /api/account rule below — different prefix, but
  // keeping them adjacent makes the distinction obvious: /api/auth is credential
  // traffic, /api/account is an authenticated user acting on their own data.
  if (pathname.startsWith('/api/auth')) return 'login';
  if (pathname.startsWith('/api/image-proxy')) return 'asset';
  if (
    pathname.startsWith('/api/chat') ||
    pathname.startsWith('/api/feed') ||
    pathname.startsWith('/api/events') ||
    // Same shape as /api/feed: fans out to Overpass/Wikipedia and reads operator
    // pages, so it belongs with the expensive routes rather than the cheap ones.
    pathname.startsWith('/api/activities')
  ) return 'ai';
  if (
    pathname.startsWith('/api/business') ||
    pathname.startsWith('/api/account') ||
    pathname.startsWith('/api/push')
  ) return 'write';
  return 'read';
}

// ── Redis-backed limiters (one sliding window per tier) ──────────────────────
let limiters: Record<Tier, Ratelimit> | null = null;
try {
  const url   = process.env.KV_REST_API_URL   ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url?.startsWith('https://') && token) {
    const redis = new Redis({ url, token });
    limiters = {
      auth:  new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(TIER_LIMITS.auth,  '1 m'), prefix: '@nova/rl/auth',  analytics: false }),
      login: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(TIER_LIMITS.login, '1 m'), prefix: '@nova/rl/login', analytics: false }),
      ai:    new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(TIER_LIMITS.ai,    '1 m'), prefix: '@nova/rl/ai',    analytics: false }),
      write: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(TIER_LIMITS.write, '1 m'), prefix: '@nova/rl/write', analytics: false }),
      read:  new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(TIER_LIMITS.read,  '1 m'), prefix: '@nova/rl/read',  analytics: false }),
      asset: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(TIER_LIMITS.asset, '1 m'), prefix: '@nova/rl/asset', analytics: false }),
    };
  }
} catch {
  // env missing or malformed — in-memory fallback stays active
}

// ── In-memory fallback (per instance) ────────────────────────────────────────
// Entries were only ever overwritten when the SAME ip+tier came back, so a
// spread of unique IPs grew this map forever — a slow leak that a spoofed
// X-Forwarded-For flood could turn into memory exhaustion on the instance.
// Expired entries are now swept, with a hard ceiling as a backstop.
const requestLog = new Map<string, { count: number; reset: number }>();
const MAX_TRACKED_IPS = 20_000;

function sweepExpired(now: number): void {
  for (const [k, v] of requestLog) if (now > v.reset) requestLog.delete(k);
  // Still oversized after sweeping → an active flood. Drop the oldest entries;
  // worst case a few clients get a fresh window, which beats falling over.
  if (requestLog.size > MAX_TRACKED_IPS) {
    const excess = requestLog.size - MAX_TRACKED_IPS;
    let i = 0;
    for (const k of requestLog.keys()) { if (i++ >= excess) break; requestLog.delete(k); }
  }
}

function getIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

// ── CORS for the bundled native app ──────────────────────────────────────────
// The iOS/Android build is a real bundled app (Capacitor), not a URL wrapper:
// its UI is served from a local origin and it calls this hosted API cross-origin.
// We allow ONLY the fixed Capacitor/local origins (never a wildcard), so browsers
// on the open web are unaffected and same-origin web requests don't even send an
// Origin. Everything stays behind the same per-IP rate limiting below.
const NATIVE_ORIGINS = new Set([
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'https://localhost',
]);

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    // `apikey` and `x-client-info` are sent by supabase-js on every auth call.
    // Since the credential endpoints are now proxied through this origin
    // (src/lib/authProxy.ts), omitting them would fail the native app's CORS
    // preflight and break sign-in on device while working fine on the web.
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info, x-admin-secret',
    'Access-Control-Max-Age':       '86400',
    'Vary':                         'Origin',
  };
}

function tooMany(limit: number, resetSec: number): NextResponse {
  return new NextResponse(
    JSON.stringify({ error: 'Too many requests. Please slow down.' }),
    {
      status: 429,
      headers: {
        'Content-Type':          'application/json',
        'Retry-After':           String(resetSec),
        'X-RateLimit-Limit':     String(limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Content-Security-Policy (documents only)
//
// This used to live in next.config.ts with `script-src 'unsafe-inline'
// 'unsafe-eval'`, which is close to having no script CSP at all: any injected
// <script> or event-handler attribute executes. A static header cannot do
// better, because a nonce has to be fresh per response — so the policy moved
// here, where each document gets its own.
//
// `strict-dynamic` is what makes this workable. The AdSense and Turnstile
// loaders are created with document.createElement('script') from our own
// bundle, so they inherit trust from the nonce'd script that created them and
// keep working, while an injected <script> tag does not. The trailing `https:`
// is the CSP2 fallback that browsers understanding strict-dynamic ignore.
//
// style-src keeps 'unsafe-inline' deliberately: the UI is built on React inline
// `style={{…}}` props and Framer Motion animates via the style attribute, so
// removing it would break rendering wholesale for a far weaker threat than
// script injection. That is a considered trade-off, not an oversight.
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "frame-src 'self' https://challenges.cloudflare.com https://maps.google.com https://www.google.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com",
    // Real venue photos come from unpredictable hosts (a venue's own og:image,
    // Google Places on *.googleusercontent.com), so any https image is allowed.
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://challenges.cloudflare.com https://cdn.jsdelivr.net https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com https://router.project-osrm.org https://routing.openstreetmap.de https://tiles.openfreemap.org https://*.openfreemap.org https://nominatim.openstreetmap.org https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Documents: per-response nonce CSP ───────────────────────────────────────
  if (!pathname.startsWith('/api/')) {
    const nonce = crypto.randomUUID().replace(/-/g, '');
    const csp = buildCsp(nonce);
    // Next reads the nonce off the REQUEST header and stamps it onto the script
    // tags it renders; without this the app's own bundle would be blocked.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }

  // CORS for the bundled native app. Add the headers to every response (and
  // answer preflight) only when the request comes from an allowed native origin.
  const origin = request.headers.get('origin') ?? '';
  const isNative = NATIVE_ORIGINS.has(origin);
  const finalize = (res: NextResponse): NextResponse => {
    if (isNative) for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v);
    return res;
  };
  if (request.method === 'OPTIONS' && isNative) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (isExcluded(pathname)) return finalize(NextResponse.next());

  const ip   = getIP(request);
  const tier = tierFor(pathname);
  const limit = TIER_LIMITS[tier];

  // ── Redis path ──────────────────────────────────────────────────────────────
  if (limiters) {
    const { success, remaining, reset } = await limiters[tier].limit(`${ip}:${tier}`);
    if (!success) return finalize(tooMany(limit, Math.max(1, Math.ceil((reset - Date.now()) / 1000))));
    const res = NextResponse.next();
    res.headers.set('X-RateLimit-Limit',     String(limit));
    res.headers.set('X-RateLimit-Remaining', String(remaining));
    return finalize(res);
  }

  // ── In-memory fallback ──────────────────────────────────────────────────────
  const now   = Date.now();
  const mapKey = `${ip}:${tier}`;
  const entry = requestLog.get(mapKey);
  if (requestLog.size > 512) sweepExpired(now); // amortised — cheap while small

  if (!entry || now > entry.reset) {
    requestLog.set(mapKey, { count: 1, reset: now + WINDOW_MS });
    const res = NextResponse.next();
    res.headers.set('X-RateLimit-Limit',     String(limit));
    res.headers.set('X-RateLimit-Remaining', String(limit - 1));
    return finalize(res);
  }

  if (entry.count >= limit) {
    return finalize(tooMany(limit, Math.max(1, Math.ceil((entry.reset - now) / 1000))));
  }

  entry.count++;
  const res = NextResponse.next();
  res.headers.set('X-RateLimit-Limit',     String(limit));
  res.headers.set('X-RateLimit-Remaining', String(limit - entry.count));
  return finalize(res);
}

export const config = {
  // Documents need the nonce CSP and /api/* needs rate limiting, so middleware
  // now runs on both — but never on static assets, which have no scripts to
  // protect and would only pay the latency.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|robots.txt|sitemap.xml|icons/|images/|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|ttf|mp4)$).*)',
  ],
};
