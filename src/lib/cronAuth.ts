import crypto from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Shared bearer auth for /api/cron/*.
//
// WHAT THIS REPLACES — a fail-OPEN guard, copy-pasted into four routes:
//
//     const secret = process.env.CRON_SECRET;
//     if (secret) {                       // ← no secret configured? no auth at all
//       if (auth !== `Bearer ${secret}`) return 401;
//     }
//     // ...falls through and runs the job
//
// If CRON_SECRET were ever unset — a fat-fingered edit, a fresh environment,
// someone tidying up variables — /api/cron/ingest, /warm, /ingest-towns and
// /push would all become publicly callable. `/push` sends push notifications to
// real users, `/ingest` and `/ingest-towns` burn Overpass / Places / Anthropic
// quota, and NONE of them are rate limited: middleware deliberately excludes
// /api/cron/* because crons arrive from rotating provider IPs.
//
// "Secure only while an environment variable happens to exist" is the wrong
// default for that. Auth now fails CLOSED: no secret configured means nobody
// gets in, including us. /api/cron/brain already did this correctly; this is
// that logic, hoisted so all five share one implementation and can't drift
// apart again (which is exactly how the admin routes ended up inconsistent —
// see src/lib/adminAuth.ts).
//
// LOCAL DEV: with no CRON_SECRET set, these routes now refuse instead of
// running. Set CRON_SECRET in your shell to exercise them locally. That is the
// intended trade — a dev inconvenience in exchange for no silent public hole.
// ─────────────────────────────────────────────────────────────────────────────

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  // Length first: timingSafeEqual throws on a length mismatch. The length of a
  // secret is not the secret, so leaking that is fine.
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * The secret guarding /api/cron/*, or '' when none is configured.
 *
 * Prefers CRON_SECRET (what Vercel Cron sends automatically) and falls back to
 * ADMIN_SECRET only when CRON_SECRET is absent — matching what
 * /api/cron/brain already did, so no route changes which key it honours.
 */
export function cronSecret(): string {
  return process.env.CRON_SECRET ?? process.env.ADMIN_SECRET ?? '';
}

/**
 * True when the request carries the cron bearer token.
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` on scheduled
 * invocations, so the same check covers both the scheduler and a manual call.
 */
export function isCronRequest(request: { headers: { get(name: string): string | null } }): boolean {
  const expected = cronSecret();
  if (!expected) return false; // fail CLOSED — the whole point of this module
  const header = request.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  return safeEqual(token, expected);
}
