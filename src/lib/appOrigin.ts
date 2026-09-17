// ─────────────────────────────────────────────────────────────────────────────
// Which origin this app should use when it calls ITSELF.
//
// Several routes do their work by fetching their own /api/feed — the ingest
// sweep, the cache warmer, the assistant, the trip planner. They all used
// `new URL(request.url).origin`, which is correct for a request that arrived
// from a user and WRONG for one that arrived from a Vercel cron.
//
// THE FAILURE. This project has Vercel Authentication on, as
// `all_except_custom_domains`. The production alias is exempt, so a user's
// request works and so did the old GitHub-driven sweep (it called the alias by
// name). But a Vercel cron invokes the PER-DEPLOYMENT url —
// nova-<hash>-<team>.vercel.app — and that one is protected: it answers 302 to
// anything without an SSO session, including this app calling itself.
//
// So every item in a cron-driven sweep fetched a redirect instead of a feed,
// found no posts, and wrote nothing. The route still returned 200 with
// `ingested: 0`, which is indistinguishable from "there was nothing to ingest" —
// the reason /api/cron/warm has been quietly doing nothing for as long as it has
// been a Vercel cron.
//
// In production we therefore resolve a stable, unprotected origin from the
// environment instead of trusting the incoming URL. Everywhere else (preview,
// local dev) the request's own origin is right and is kept.
// ─────────────────────────────────────────────────────────────────────────────

function cleanHttps(value: string | undefined): string {
  const v = (value ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[^\s/]+$/.test(v) ? v : '';
}

/**
 * The origin to use for this app's own internal fetches.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` is preferred because Vercel sets it itself and
 * it always names the project's production domain — it cannot drift the way a
 * hand-entered value can. NEXT_PUBLIC_SITE_URL is the deliberate override for
 * when a custom domain should be used instead.
 */
export function appOrigin(request: { url: string }): string {
  if (process.env.VERCEL_ENV === 'production') {
    const fromVercel = cleanHttps(
      process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : ''
    );
    if (fromVercel) return fromVercel;

    const configured = cleanHttps(process.env.NEXT_PUBLIC_SITE_URL);
    if (configured) return configured;
  }
  return new URL(request.url).origin;
}
