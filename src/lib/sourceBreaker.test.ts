import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { upstreamPaused, pauseUpstream, resetBreaker, retryAfterSeconds, logSourceError } from './sourceBreaker';

// No Redis in tests, so cacheGet/cacheSet no-op and the breaker runs purely
// in-process — which is exactly the degraded mode it has to work in when Upstash
// is not configured. Every name is unique per test so state cannot leak.
let n = 0;
const name = () => `test-upstream-${++n}`;

describe('upstreamPaused / pauseUpstream', () => {
  beforeEach(() => { vi.useRealTimers(); });

  it('is closed until something opens it', async () => {
    expect(await upstreamPaused(name())).toBe(false);
  });

  it('is open for the requested window, then closes again', async () => {
    const u = name();
    vi.useFakeTimers();
    await pauseUpstream(u, 60, 'HTTP 429');
    expect(await upstreamPaused(u)).toBe(true);

    vi.advanceTimersByTime(59_000);
    expect(await upstreamPaused(u)).toBe(true);

    // Cooled down — the next call is allowed to try the upstream again, which is
    // what lets the app recover on its own once a top-up or quota reset lands.
    vi.advanceTimersByTime(2_000);
    expect(await upstreamPaused(u)).toBe(false);
    vi.useRealTimers();
  });

  it('logs the reason ONCE, however many times it is told', async () => {
    const u = name();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // The whole point: a breaker that logs per call has become the noise it
    // exists to stop. Three hundred Overpass 429s must produce one line.
    for (let i = 0; i < 50; i++) await pauseUpstream(u, 60, 'HTTP 429');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain('HTTP 429');
    spy.mockRestore();
  });

  it('carries the reason and the cooldown into the log line', async () => {
    const u = name();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await pauseUpstream(u, 900, 'out of Anthropic credit');
    expect(String(spy.mock.calls[0][0])).toMatch(/paused 900s — out of Anthropic credit/);
    spy.mockRestore();
  });

  it('never throws on an absurd duration', async () => {
    const u = name();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(pauseUpstream(u, 0, 'zero')).resolves.toBeUndefined();
    await expect(pauseUpstream(u, -5, 'negative')).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });

  it('resetBreaker lets an upstream straight back in', async () => {
    const u = name();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await pauseUpstream(u, 3600, 'stuck');
    expect(await upstreamPaused(u)).toBe(true);
    resetBreaker(u);
    expect(await upstreamPaused(u)).toBe(false);
    vi.restoreAllMocks();
  });
});

describe('retryAfterSeconds', () => {
  const res = (v?: string) => ({ headers: { get: () => v ?? null } });

  it('reads a plain seconds value', () => {
    expect(retryAfterSeconds(res('120'))).toBe(120);
  });

  it('reads an HTTP-date value', () => {
    const at = new Date(Date.now() + 30_000).toUTCString();
    expect(retryAfterSeconds(res(at))).toBeGreaterThan(25);
    expect(retryAfterSeconds(res(at))).toBeLessThanOrEqual(30);
  });

  it('returns null when absent or unparseable, so the caller uses its default', () => {
    expect(retryAfterSeconds(res())).toBeNull();
    expect(retryAfterSeconds(res('soon-ish'))).toBeNull();
  });

  it('clamps an outrageous value — an upstream does not get to pause us for a week', () => {
    expect(retryAfterSeconds(res('999999'))).toBe(3600);
  });

  it('never returns a negative wait for a date already past', () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(retryAfterSeconds(res(past))).toBe(0);
  });
});

describe('logSourceError', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { spy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { spy.mockRestore(); });

  it('stays quiet for third-party throttling the breakers already reported', () => {
    for (const n of ['EventbriteThrottledError', 'OverpassThrottledError', 'ClaudeUnavailableError']) {
      const err = new Error('throttled');
      err.name = n;
      logSourceError('[feed/x]', err);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('still logs everything else in full', () => {
    // The risk of suppressing noise is suppressing signal. A real fault from the
    // same code path must still reach the log — and Sentry.
    logSourceError('[feed/eb]', new TypeError('Cannot read properties of undefined'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('[feed/eb]');
  });

  it('logs non-Error throws too', () => {
    logSourceError('[feed/eb]', 'something odd');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
