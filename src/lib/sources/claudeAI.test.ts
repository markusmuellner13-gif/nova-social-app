import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enrichEventDescriptions, claudeAvailable, ClaudeUnavailableError } from './claudeAI';
import { resetBreaker } from '@/lib/sourceBreaker';

// ─────────────────────────────────────────────────────────────────────────────
// Between Sept 11 and 13 every Claude call in production came back with
//   "Your credit balance is too low to access the Anthropic API"
// and the app kept calling — several times per feed request, for three days.
// The fallbacks meant nothing broke for users, but each doomed call still cost a
// round trip inside a 60-second function, and each one wrote a [feed/ai] error.
//
// An empty account cannot be retried into a full one. These tests pin that the
// app notices, stands down, and comes back on its own.
// ─────────────────────────────────────────────────────────────────────────────

const ITEMS = [{ name: 'Gig', venue: 'Flex', date: '2026-10-01', time: '20:00', genre: 'rock', price: '€20' }];

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  } as unknown as Response;
}

const OK = () => respond(200, { content: [{ type: 'text', text: '["a description"]' }] });

// Anthropic returns the out-of-credit fault as a 400 invalid_request_error, so
// the status alone cannot identify it — the body has to be read. This is the
// exact shape production saw.
const OUT_OF_CREDIT = () => respond(400, {
  type: 'error',
  error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' },
});

describe('Claude credit/auth breaker', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetBreaker('anthropic');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => { vi.restoreAllMocks(); resetBreaker('anthropic'); });

  it('calls Anthropic normally while the account is healthy', async () => {
    fetchSpy.mockResolvedValue(OK());
    expect(await claudeAvailable()).toBe(true);
    await expect(enrichEventDescriptions(ITEMS, 'Vienna', 'key')).resolves.toEqual(['a description']);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('stops calling after "credit balance is too low"', async () => {
    fetchSpy.mockResolvedValue(OUT_OF_CREDIT());

    // The first call goes out and fails — that is how we learn.
    await expect(enrichEventDescriptions(ITEMS, 'Vienna', 'key')).rejects.toThrow(/credit balance/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Every call after it fails INSTANTLY, without a round trip. This is the
    // whole fix: 60 doomed calls per ingest run become 1.
    for (let i = 0; i < 20; i++) {
      await expect(enrichEventDescriptions(ITEMS, 'Vienna', 'key')).rejects.toBeInstanceOf(ClaudeUnavailableError);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await claudeAvailable()).toBe(false);
  });

  it('comes back by itself once the pause elapses — a top-up needs no redeploy', async () => {
    vi.useFakeTimers();
    fetchSpy.mockResolvedValue(OUT_OF_CREDIT());
    await expect(enrichEventDescriptions(ITEMS, 'Vienna', 'key')).rejects.toThrow();
    expect(await claudeAvailable()).toBe(false);

    // The billing pause is 15 minutes: long enough to stop the bleeding, short
    // enough that adding credit takes effect on its own.
    vi.advanceTimersByTime(14 * 60 * 1000);
    expect(await claudeAvailable()).toBe(false);
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(await claudeAvailable()).toBe(true);

    fetchSpy.mockResolvedValue(OK());
    await expect(enrichEventDescriptions(ITEMS, 'Vienna', 'key')).resolves.toEqual(['a description']);
    vi.useRealTimers();
  });

  it('stands down on a rejected key, and honours Retry-After on a 429', async () => {
    fetchSpy.mockResolvedValue(respond(401, { error: { message: 'invalid x-api-key' } }));
    await expect(enrichEventDescriptions(ITEMS, 'Vienna', 'bad-key')).rejects.toThrow();
    expect(await claudeAvailable()).toBe(false);

    resetBreaker('anthropic');
    vi.useFakeTimers();
    fetchSpy.mockResolvedValue(respond(429, { error: { message: 'rate_limit_error' } }, { 'retry-after': '90' }));
    await expect(enrichEventDescriptions(ITEMS, 'Vienna', 'key')).rejects.toThrow();
    vi.advanceTimersByTime(89_000);
    expect(await claudeAvailable()).toBe(false);
    vi.advanceTimersByTime(2_000);
    expect(await claudeAvailable()).toBe(true);
    vi.useRealTimers();
  });

  it('does NOT stand down for a one-off fault', async () => {
    // A 500 is not a reason to stop using a working account for 15 minutes.
    fetchSpy.mockResolvedValue(respond(500, { error: { message: 'internal' } }));
    await expect(enrichEventDescriptions(ITEMS, 'Vienna', 'key')).rejects.toThrow();
    expect(await claudeAvailable()).toBe(true);
  });

  it('reports the failure once, with the fix in the message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchSpy.mockResolvedValue(OUT_OF_CREDIT());
    for (let i = 0; i < 10; i++) {
      await enrichEventDescriptions(ITEMS, 'Vienna', 'key').catch(() => {});
    }
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain('console.anthropic.com');
  });
});
