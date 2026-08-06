import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { cacheGet, cacheSet, cacheDelete } from '@/lib/serverCache';

// ─────────────────────────────────────────────────────────────────────────────
// Rate-limited reverse proxy for Supabase's credential endpoints.
//
// supabase-js normally posts straight to <project>.supabase.co, which Nova's
// middleware never sees — so login was the one endpoint with no rate limiting at
// all. src/lib/authProxy.ts rewrites just the credential-taking calls here;
// middleware applies the `login` tier on the way in, and this route adds the
// control that actually matters against credential stuffing: per-account
// exponential backoff.
//
// WHY BOTH: per-IP limits alone are the wrong tool here. They're too loose to
// stop a botnet spreading 5 guesses across 10,000 addresses, and too tight for
// carrier-grade NAT, where thousands of real users share one IP. Per-account
// backoff is the precise control — it tracks the thing being attacked (one
// account) instead of the thing that's cheap to rotate (an IP).
//
// ONLY counts FAILED attempts, and clears on success, so a user who logs in
// correctly is never penalised for a typo earlier in the day.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Must match PROXIED in src/lib/authProxy.ts. Anything else 404s — this is an
// allowlist, not a pass-through, so the route can never become an open relay to
// arbitrary Supabase paths (or, worse, arbitrary hosts).
const ALLOWED = new Set(['signup', 'recover', 'otp', 'token']);

// Failures → how long that account is refused, regardless of source IP.
// Deliberately gentle at first: real people fat-finger passwords.
const BACKOFF: { after: number; seconds: number }[] = [
  { after: 20, seconds: 3600 },  // 1 hour
  { after: 12, seconds: 900 },   // 15 minutes
  { after: 8,  seconds: 120 },
  { after: 5,  seconds: 30 },
];
const FAILURE_TTL = 3600; // failure count decays after an hour of quiet

// Identifiers are hashed before they touch Redis: a rate-limit store should not
// double as a list of everyone who has ever tried to log in. Keyed with a server
// secret so the hashes aren't reversible by guessing common emails.
function identifierKey(identifier: string): string {
  const secret = process.env.CRON_SECRET ?? process.env.ADMIN_SECRET ?? 'nova-auth-pepper';
  const h = crypto.createHmac('sha256', secret)
    .update(identifier.trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);
  return `nova:authfail:${h}`;
}

export function lockoutFor(failures: number): number {
  for (const step of BACKOFF) if (failures >= step.after) return step.seconds;
  return 0;
}

/**
 * Was this response an actual wrong-password answer, as opposed to the request
 * being malformed or failing CAPTCHA?
 *
 * This distinction is the whole safety of the lockout. Supabase checks CAPTCHA
 * BEFORE credentials (verified: a token request with no captcha_token returns
 * 400 `captcha_failed` without ever touching the password). If those counted,
 * anyone could lock any user out of their own account just by posting that
 * user's email with no captcha token — an account-takeover-adjacent denial of
 * service handed out for free. Only a genuine credential rejection counts,
 * because only that requires the attacker to actually be guessing.
 */
export function isWrongCredential(status: number, body: string): boolean {
  // 429 and 5xx are never counted either: being throttled or unlucky upstream
  // must not push a real user toward a lockout.
  if (status !== 400 && status !== 401 && status !== 422) return false;
  let code = '';
  let msg = '';
  try {
    const parsed = JSON.parse(body) as { error_code?: unknown; msg?: unknown; error?: unknown };
    if (typeof parsed.error_code === 'string') code = parsed.error_code;
    if (typeof parsed.msg === 'string') msg = parsed.msg;
    else if (typeof parsed.error === 'string') msg = parsed.error;
  } catch {
    return false; // unparseable → don't guess, don't count
  }
  if (code === 'invalid_credentials') return true;
  // Older GoTrue versions answer with the message only.
  return /invalid login credentials/i.test(msg);
}

function tooMany(retryAfterSec: number): NextResponse {
  // Shaped like a Supabase auth error so the client surfaces it normally
  // instead of showing an unrecognised-response crash.
  return NextResponse.json(
    {
      error: 'over_request_rate_limit',
      error_description: 'Too many attempts. Please wait and try again.',
      msg: 'Too many attempts. Please wait and try again.',
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSec),
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const endpoint = (path ?? []).join('/');

  if (!ALLOWED.has(endpoint)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: 'auth_unavailable' }, { status: 503 });
  }

  // `token` also serves the refresh grant. authProxy only rewrites the password
  // grant, but a hand-crafted request could aim anything here — refuse rather
  // than quietly proxying a refresh through the login limiter.
  const grantType = request.nextUrl.searchParams.get('grant_type');
  if (endpoint === 'token' && grantType !== 'password') {
    return NextResponse.json({ error: 'unsupported_grant' }, { status: 400 });
  }

  const body = await request.text();

  // Pull the account being targeted so the backoff can key on it. Failure to
  // parse is not fatal — the request still goes through the per-IP tier.
  let identifier = '';
  try {
    const parsed = JSON.parse(body) as { email?: unknown; phone?: unknown };
    if (typeof parsed.email === 'string') identifier = parsed.email;
    else if (typeof parsed.phone === 'string') identifier = parsed.phone;
  } catch { /* non-JSON body — no identifier to key on */ }

  // Per-account backoff applies to SIGN-IN ONLY.
  //
  // It deliberately does not cover signup/recover/otp. Those aren't credential
  // guesses — there is nothing to get right — so counting "failures" against an
  // email there would let anyone lock a stranger out of their own account by
  // spamming malformed requests with that address. Those endpoints are covered
  // by the per-IP `login` tier and by Supabase's CAPTCHA instead.
  const tracksAccount = endpoint === 'token';
  const key = tracksAccount && identifier ? identifierKey(identifier) : '';

  if (key) {
    const failures = (await cacheGet<number>(key)) ?? 0;
    const lock = lockoutFor(failures);
    if (lock > 0) {
      // Identical response whether or not the account exists, so this can't be
      // used to discover which emails are registered.
      return tooMany(lock);
    }
  }

  // ── Forward to Supabase ────────────────────────────────────────────────────
  const target = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/${endpoint}${request.nextUrl.search}`;

  const headers = new Headers();
  for (const h of ['apikey', 'authorization', 'content-type', 'x-client-info', 'accept']) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  // Supabase sees Vercel's egress IP for these now, so pass the real client
  // address along. Supabase may or may not honour it, but withholding it would
  // guarantee it can't.
  const clientIp = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip');
  if (clientIp) headers.set('x-forwarded-for', clientIp);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { error: 'auth_upstream_unavailable', msg: 'Could not reach the auth service.' },
      { status: 502 },
    );
  }

  const text = await upstream.text();

  // ── Record the outcome ─────────────────────────────────────────────────────
  if (key) {
    if (upstream.ok) {
      // Correct credentials clear the slate.
      await cacheDelete(key);
    } else if (isWrongCredential(upstream.status, text)) {
      const failures = ((await cacheGet<number>(key)) ?? 0) + 1;
      await cacheSet(key, failures, FAILURE_TTL);
    }
  }

  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
}
