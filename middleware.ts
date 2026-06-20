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

type Tier = 'ai' | 'write' | 'read';

// Requests allowed per minute, per IP, per tier.
const TIER_LIMITS: Record<Tier, number> = {
  ai:    20,   // /api/chat, /api/feed, /api/events — paid upstreams
  write: 15,   // /api/business/checkout, /api/account/*, /api/push/* — mutations
  read:  60,   // /api/geocode, /api/track, /api/image-proxy, /api/sponsored — cheap
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
  if (
    pathname.startsWith('/api/chat') ||
    pathname.startsWith('/api/feed') ||
    pathname.startsWith('/api/events')
  ) return 'ai';
  if (
    pathname.startsWith('/api/business') ||
    pathname.startsWith('/api/account') ||
    pathname.startsWith('/api/push') ||
    pathname.startsWith('/api/admin')
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
      ai:    new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(TIER_LIMITS.ai,    '1 m'), prefix: '@nova/rl/ai',    analytics: false }),
      write: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(TIER_LIMITS.write, '1 m'), prefix: '@nova/rl/write', analytics: false }),
      read:  new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(TIER_LIMITS.read,  '1 m'), prefix: '@nova/rl/read',  analytics: false }),
    };
  }
} catch {
  // env missing or malformed — in-memory fallback stays active
}

// ── In-memory fallback (per instance) ────────────────────────────────────────
const requestLog = new Map<string, { count: number; reset: number }>();

function getIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/api/')) return NextResponse.next();
  if (isExcluded(pathname)) return NextResponse.next();

  const ip   = getIP(request);
  const tier = tierFor(pathname);
  const limit = TIER_LIMITS[tier];

  // ── Redis path ──────────────────────────────────────────────────────────────
  if (limiters) {
    const { success, remaining, reset } = await limiters[tier].limit(`${ip}:${tier}`);
    if (!success) return tooMany(limit, Math.max(1, Math.ceil((reset - Date.now()) / 1000)));
    const res = NextResponse.next();
    res.headers.set('X-RateLimit-Limit',     String(limit));
    res.headers.set('X-RateLimit-Remaining', String(remaining));
    return res;
  }

  // ── In-memory fallback ──────────────────────────────────────────────────────
  const now   = Date.now();
  const mapKey = `${ip}:${tier}`;
  const entry = requestLog.get(mapKey);

  if (!entry || now > entry.reset) {
    requestLog.set(mapKey, { count: 1, reset: now + WINDOW_MS });
    const res = NextResponse.next();
    res.headers.set('X-RateLimit-Limit',     String(limit));
    res.headers.set('X-RateLimit-Remaining', String(limit - 1));
    return res;
  }

  if (entry.count >= limit) {
    return tooMany(limit, Math.max(1, Math.ceil((entry.reset - now) / 1000)));
  }

  entry.count++;
  const res = NextResponse.next();
  res.headers.set('X-RateLimit-Limit',     String(limit));
  res.headers.set('X-RateLimit-Remaining', String(limit - entry.count));
  return res;
}

export const config = {
  matcher: '/api/:path*',
};
