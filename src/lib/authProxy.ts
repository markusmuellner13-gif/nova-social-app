import { apiUrl } from './apiBase';

// ─────────────────────────────────────────────────────────────────────────────
// Routing credential traffic through Nova's own origin, so middleware can see it.
//
// THE PROBLEM: supabase-js talks to <project>.supabase.co directly. Nova's
// middleware only runs on Nova's own routes, so it never saw a single login
// attempt — `middleware.ts` rate limiting covered /api/feed and /api/admin while
// the password endpoint, the one thing worth brute-forcing, was wide open to us.
// Supabase's own limits were the only brake, and those are dashboard config we
// don't control from here.
//
// THE FIX: a custom `fetch` for the Supabase client that rewrites ONLY the
// credential-taking endpoints onto /api/auth/*, which middleware does see. The
// proxy route forwards them to Supabase unchanged.
//
// WHAT IS DELIBERATELY *NOT* REWRITTEN:
//   * token refresh (`grant_type=refresh_token`) — runs constantly for every
//     signed-in user, is not a guessing surface, and putting it behind a rate
//     limit risks logging people out for using the app normally.
//   * PostgREST, realtime, storage — different hosts/paths, untouched.
//   * the OAuth redirect — that's a browser navigation to Google, not a fetch.
// So the blast radius is: sign-in, sign-up, and the two email-sending endpoints.
// If the proxy were ever down, the app is served from the same Vercel deployment
// anyway, so this adds no new single point of failure.
// ─────────────────────────────────────────────────────────────────────────────

/** Auth endpoints worth rate limiting, and why. */
const PROXIED = new Set([
  'signup',   // account creation — abuse/spam surface
  'recover',  // sends a reset email — email-bombing surface
  'otp',      // sends a magic link — email-bombing surface
  'token',    // sign-in, but ONLY the password grant (see below)
]);

/**
 * Returns the rewritten URL, or null to leave the request alone.
 * Exported for tests.
 */
export function rewriteAuthUrl(rawUrl: string, supabaseUrl: string): string | null {
  if (!supabaseUrl) return null;
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(rawUrl);
    base = new URL(supabaseUrl);
  } catch {
    return null;
  }

  if (parsed.host !== base.host) return null;
  if (!parsed.pathname.startsWith('/auth/v1/')) return null;

  const endpoint = parsed.pathname.slice('/auth/v1/'.length).replace(/\/+$/, '');
  if (!PROXIED.has(endpoint)) return null;

  // `token` serves both sign-in and the background refresh. Only the former is a
  // credential guess; rewriting the latter would rate-limit ordinary use.
  if (endpoint === 'token' && parsed.searchParams.get('grant_type') !== 'password') {
    return null;
  }

  return apiUrl(`/api/auth/${endpoint}${parsed.search}`);
}

/**
 * Drop-in `fetch` for createClient's `global.fetch`. Anything it doesn't
 * recognise is passed through to the real fetch untouched.
 */
export function makeAuthProxyFetch(supabaseUrl: string): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // supabase-js calls fetch(urlString, init). A Request object carries its body
    // on the object itself, so rewriting the URL would drop it — pass those through.
    if (typeof input !== 'string' && !(input instanceof URL)) {
      return fetch(input, init);
    }
    const url = typeof input === 'string' ? input : input.href;
    const rewritten = rewriteAuthUrl(url, supabaseUrl);
    return fetch(rewritten ?? url, init);
  };
}
