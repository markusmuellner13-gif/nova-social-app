import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiting for the events API.
// This works well with Vercel Edge (long-lived) and degrades gracefully on cold starts.
// For production at scale, replace requestLog with an Upstash Redis store.

const WINDOW_MS = 60_000;   // 1 minute window
const MAX_REQUESTS = 40;     // requests per IP per minute on the events API
const requestLog = new Map<string, { count: number; reset: number }>();

function getIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only rate-limit the events API
  if (!pathname.startsWith('/api/events')) return NextResponse.next();

  const ip  = getIP(request);
  const now = Date.now();
  const entry = requestLog.get(ip);

  if (!entry || now > entry.reset) {
    requestLog.set(ip, { count: 1, reset: now + WINDOW_MS });
    return withRateLimitHeaders(NextResponse.next(), MAX_REQUESTS - 1, Math.ceil(WINDOW_MS / 1000));
  }

  if (entry.count >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.reset - now) / 1000);
    return new NextResponse(JSON.stringify({ error: 'Too many requests. Please slow down.' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(MAX_REQUESTS),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(entry.reset / 1000)),
      },
    });
  }

  entry.count++;
  const remaining = MAX_REQUESTS - entry.count;
  const resetIn   = Math.ceil((entry.reset - now) / 1000);
  return withRateLimitHeaders(NextResponse.next(), remaining, resetIn);
}

function withRateLimitHeaders(res: NextResponse, remaining: number, resetIn: number): NextResponse {
  res.headers.set('X-RateLimit-Limit',     String(MAX_REQUESTS));
  res.headers.set('X-RateLimit-Remaining', String(remaining));
  res.headers.set('X-RateLimit-Reset',     String(resetIn));
  return res;
}

export const config = {
  matcher: '/api/:path*',
};
