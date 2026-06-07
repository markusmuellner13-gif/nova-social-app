import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const MAX_REQUESTS = 40;
const WINDOW_MS    = 60_000; // 1 minute

// ── Redis-backed rate limiting (Upstash) ─────────────────────────────────────
// When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, rate limits
// persist across all serverless instances and survive cold starts.
// Without them, falls back to in-memory (resets on cold starts — fine for dev).
let ratelimit: Ratelimit | null = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    ratelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(MAX_REQUESTS, '1 m'),
      analytics: false,
      prefix: '@nova/rl',
    });
  }
} catch {
  // env vars missing or malformed — in-memory fallback stays active
}

// ── In-memory fallback ────────────────────────────────────────────────────────
const requestLog = new Map<string, { count: number; reset: number }>();

function getIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/api/events')) return NextResponse.next();

  const ip = getIP(request);

  // ── Redis path ──────────────────────────────────────────────────────────────
  if (ratelimit) {
    const { success, limit, remaining, reset } = await ratelimit.limit(ip);
    if (!success) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests. Please slow down.' }),
        {
          status: 429,
          headers: {
            'Content-Type':        'application/json',
            'Retry-After':         String(Math.ceil((reset - Date.now()) / 1000)),
            'X-RateLimit-Limit':   String(limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset':   String(Math.ceil(reset / 1000)),
          },
        },
      );
    }
    const res = NextResponse.next();
    res.headers.set('X-RateLimit-Limit',     String(limit));
    res.headers.set('X-RateLimit-Remaining', String(remaining));
    res.headers.set('X-RateLimit-Reset',     String(Math.ceil(reset / 1000)));
    return res;
  }

  // ── In-memory fallback ──────────────────────────────────────────────────────
  const now   = Date.now();
  const entry = requestLog.get(ip);

  if (!entry || now > entry.reset) {
    requestLog.set(ip, { count: 1, reset: now + WINDOW_MS });
    return withHeaders(NextResponse.next(), MAX_REQUESTS - 1, Math.ceil(WINDOW_MS / 1000));
  }

  if (entry.count >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.reset - now) / 1000);
    return new NextResponse(
      JSON.stringify({ error: 'Too many requests. Please slow down.' }),
      {
        status: 429,
        headers: {
          'Content-Type':          'application/json',
          'Retry-After':           String(retryAfter),
          'X-RateLimit-Limit':     String(MAX_REQUESTS),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset':     String(Math.ceil(entry.reset / 1000)),
        },
      },
    );
  }

  entry.count++;
  return withHeaders(
    NextResponse.next(),
    MAX_REQUESTS - entry.count,
    Math.ceil((entry.reset - now) / 1000),
  );
}

function withHeaders(res: NextResponse, remaining: number, resetIn: number): NextResponse {
  res.headers.set('X-RateLimit-Limit',     String(MAX_REQUESTS));
  res.headers.set('X-RateLimit-Remaining', String(remaining));
  res.headers.set('X-RateLimit-Reset',     String(resetIn));
  return res;
}

export const config = {
  matcher: '/api/:path*',
};
