// ─────────────────────────────────────────────────────────────────────────────
// Upstream circuit breaker — stop calling something that just told us to stop.
//
// Three different upstreams were failing in a way that retrying cannot fix, and
// in every case the app kept calling anyway:
//
//   • Anthropic  — "credit balance is too low" on EVERY call, for three days.
//     Each attempt still cost a 7–25s round trip inside a 60s function.
//   • Google Places (legacy) — REQUEST_DENIED because the key isn't authorised
//     for that API. That is a console setting; no number of retries changes it.
//   • Eventbrite / Overpass — 429 and 504. Retrying *immediately* is what earns
//     the next 429; these want to be left alone for a while.
//
// A breaker turns "fail slowly, hundreds of times, once per log line" into
// "fail instantly, and say so once". That is the whole point: the fallbacks were
// always there and always worked, so the failures were never user-visible — they
// were just slow and loud. This makes them fast and quiet.
//
// Backed by Redis so one lambda's discovery spares every other lambda, with an
// in-process layer so the common "everything is fine" path costs nothing. FULLY
// GATED: without Redis it still works, just per-lambda instead of app-wide.
// ─────────────────────────────────────────────────────────────────────────────

import { cacheGet, cacheSet } from '@/lib/serverCache';

interface Pause {
  until: number;   // epoch ms
  reason: string;
}

// Breakers this lambda knows are open.
const openLocally = new Map<string, Pause>();
// When we last asked Redis about a breaker that turned out to be closed. Reading
// Redis on every single call would add a round trip to the healthy path, which
// is the path that matters; a stale-by-20s "it's fine" is harmless.
const lastChecked = new Map<string, number>();
const CLOSED_TRUST_MS = 20_000;

// One log line per breaker per lambda. A breaker exists to stop noise, so it
// must not become the noise.
const logged = new Set<string>();

function redisKey(name: string): string {
  return `nova:breaker:${name}`;
}

/**
 * Is this upstream currently paused? Callers should treat `true` as "skip it and
 * use the fallback", never as an error.
 */
export async function upstreamPaused(name: string): Promise<boolean> {
  const now = Date.now();

  const mine = openLocally.get(name);
  if (mine) {
    if (mine.until > now) return true;
    openLocally.delete(name);   // cooled down — let the next call try again
    logged.delete(name);
  }

  if (now - (lastChecked.get(name) ?? 0) < CLOSED_TRUST_MS) return false;
  lastChecked.set(name, now);

  const shared = await cacheGet<Pause>(redisKey(name));
  if (shared && typeof shared.until === 'number' && shared.until > now) {
    openLocally.set(name, shared);
    return true;
  }
  return false;
}

/**
 * Stop calling `name` for `seconds`. Safe to call repeatedly — the log line and
 * the Redis write only happen when the breaker actually opens.
 */
export async function pauseUpstream(name: string, seconds: number, reason: string): Promise<void> {
  const secs = Math.max(1, Math.round(seconds));
  const pause: Pause = { until: Date.now() + secs * 1000, reason: reason.slice(0, 200) };

  const existing = openLocally.get(name);
  const wasOpen = Boolean(existing && existing.until > Date.now());
  openLocally.set(name, pause);

  if (!wasOpen && !logged.has(name)) {
    logged.add(name);
    // One honest line with the reason and how long we'll stay away, so the
    // Sentry rule in docs/ALERTING.md still fires — see `[breaker/*]`.
    console.error(`[breaker/${name}] paused ${secs}s — ${pause.reason}`);
  }

  // Best effort: the in-process pause already works without this.
  await cacheSet(redisKey(name), pause, secs).catch(() => {});
}

/** Let an upstream back in early (used by tests and the admin cache tools). */
export function resetBreaker(name: string): void {
  openLocally.delete(name);
  lastChecked.delete(name);
  logged.delete(name);
}

// ── Logging a source that failed ─────────────────────────────────────────────

// Errors that mean "a third party is rationing us", not "something is broken".
// Matched by name rather than by class so this module stays free of imports from
// the source modules that import it.
const EXPECTED = new Set([
  'EventbriteThrottledError',   // Eventbrite public pages — 721 × HTTP 429 in September
  'OverpassThrottledError',     // every Overpass mirror standing down
  'ClaudeUnavailableError',     // Anthropic breaker open (out of credit / rate limited)
]);

/**
 * Log a source failure — unless it is one the breakers already reported.
 *
 * Roughly a thousand of September's log entries were third-party throttling,
 * every one of them handled correctly by a fallback and invisible to users. At
 * error level they buried the entries that actually meant something and drowned
 * the Sentry rules in docs/ALERTING.md. A throttle is now reported once, by the
 * breaker that opened it (`[breaker/*]`, with the reason and the cooldown);
 * everything else is still a real error and still logged in full.
 */
export function logSourceError(tag: string, err: unknown): void {
  if (err instanceof Error && EXPECTED.has(err.name)) return;
  console.error(tag, err);
}

// ── Reading "go away" out of an HTTP response ────────────────────────────────

/**
 * How long an upstream asked us to wait, from `Retry-After` (seconds, or an
 * HTTP date). Returns null when the header is absent or unparseable, so the
 * caller applies its own default.
 */
export function retryAfterSeconds(res: { headers: { get(name: string): string | null } }): number | null {
  const raw = res.headers.get('retry-after');
  if (!raw) return null;
  const secs = Number(raw.trim());
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs, 3600);
  const at = Date.parse(raw);
  if (Number.isFinite(at)) return Math.min(Math.max(0, (at - Date.now()) / 1000), 3600);
  return null;
}
