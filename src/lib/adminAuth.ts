import crypto from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Shared bearer auth for /api/admin/*.
//
// WHY THIS EXISTS AS ONE FUNCTION: the three admin routes each grew their own
// copy of this check and they had already drifted. `sponsored` used
// `ADMIN_SECRET || CRON_SECRET` — prefer the admin secret, fall back only if
// it's unset. `cache` and `photos` looped over BOTH and accepted either, so
// setting a dedicated ADMIN_SECRET did not stop the cron secret from opening
// admin endpoints. Verified against production: a request bearing CRON_SECRET
// got 200 from /api/admin/photos.
//
// That matters because CRON_SECRET is the *widely-copied* one. It lives in cron
// configuration, gets pasted into curl commands for cache purges, and ends up in
// terminal scrollback and notes. A secret with that blast radius should not also
// be the key to the admin surface.
//
// The rule is now uniform and fail-closed-ish by design:
//   ADMIN_SECRET set   → ONLY ADMIN_SECRET is accepted. CRON_SECRET is dead here
//                        the moment you set it — no redeploy, no code change.
//   ADMIN_SECRET unset → fall back to CRON_SECRET, so nothing breaks for a
//                        project that hasn't split them yet.
//   Neither set        → refuse everything.
// ─────────────────────────────────────────────────────────────────────────────

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  // Length is compared first because timingSafeEqual throws on a mismatch. The
  // length itself leaks, which is fine — secret length is not the secret.
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** The secret that currently guards /api/admin/*, or '' when none is configured. */
export function adminSecret(): string {
  return process.env.ADMIN_SECRET || process.env.CRON_SECRET || '';
}

/**
 * True when the request carries the admin bearer token.
 *
 * Header-only, never a query string: a `?secret=` lands in server access logs,
 * browser history and Referer headers.
 */
export function isAdminRequest(request: { headers: { get(name: string): string | null } }): boolean {
  const secret = adminSecret();
  if (!secret) return false;
  const provided = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!provided) return false;
  return safeEqual(provided, secret);
}
