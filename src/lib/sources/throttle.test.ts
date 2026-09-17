import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchEventbriteEvents, EventbriteThrottledError } from './eventbrite';
import { fetchOverpassPlaces, OverpassThrottledError } from './osm';
import { resetBreaker } from '@/lib/sourceBreaker';

// ─────────────────────────────────────────────────────────────────────────────
// Eventbrite's 429s (721) and Overpass's 429/504s (~300) were the bulk of the
// app's September log volume. None of them was a fault of ours and none was
// visible to a user — the feed's other sources cover for both, exactly as
// designed. What they cost was TIME: an 8s Eventbrite timeout and up to 13s per
// Overpass mirror, burned inside cron slices racing a 60-second platform cap.
//
// Retrying a 429 immediately is also how you earn the next one.
// ─────────────────────────────────────────────────────────────────────────────

const EB_BREAKER = 'eventbrite';
const OVERPASS_BREAKERS = ['overpass:overpass.kumi.systems', 'overpass:overpass-api.de'];

function res(status: number, headers: Record<string, string> = {}, body = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    text: async () => body,
    json: async () => ({}),
  } as unknown as Response;
}

describe('Eventbrite throttling', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetBreaker(EB_BREAKER);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => { vi.restoreAllMocks(); resetBreaker(EB_BREAKER); });

  it('stops calling after a 429, and says so with a typed error', async () => {
    fetchSpy.mockResolvedValue(res(429));
    await expect(fetchEventbriteEvents('Vienna', 'Austria', 48.2, 16.4, 20))
      .rejects.toBeInstanceOf(EventbriteThrottledError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Subsequent calls return an empty list instantly. That is the same result
    // the caller got from the failing fetch — just 8 seconds sooner, and without
    // adding to the 429 count that caused the throttle.
    for (let i = 0; i < 10; i++) {
      await expect(fetchEventbriteEvents('Vienna', 'Austria', 48.2, 16.4, 20)).resolves.toEqual([]);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('honours Retry-After rather than guessing', async () => {
    vi.useFakeTimers();
    fetchSpy.mockResolvedValue(res(429, { 'retry-after': '30' }));
    await expect(fetchEventbriteEvents('Vienna', 'Austria', 48.2, 16.4, 20)).rejects.toThrow();

    vi.advanceTimersByTime(29_000);
    await expect(fetchEventbriteEvents('Vienna', 'Austria', 48.2, 16.4, 20)).resolves.toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Waited it out — try again for real.
    vi.advanceTimersByTime(2_000);
    fetchSpy.mockResolvedValue(res(200, {}, '<html></html>'));
    await expect(fetchEventbriteEvents('Vienna', 'Austria', 48.2, 16.4, 20)).resolves.toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('leaves a 404 alone — a missing city page is not a throttle', async () => {
    fetchSpy.mockResolvedValue(res(404));
    await expect(fetchEventbriteEvents('Nowhere', 'Nowhere', 0, 0, 20)).rejects.toThrow(/Eventbrite 404/);
    // The breaker stays closed: other cities' pages are still fine.
    fetchSpy.mockResolvedValue(res(200, {}, '<html></html>'));
    await expect(fetchEventbriteEvents('Vienna', 'Austria', 48.2, 16.4, 20)).resolves.toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('Overpass throttling', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    OVERPASS_BREAKERS.forEach(resetBreaker);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => { vi.restoreAllMocks(); OVERPASS_BREAKERS.forEach(resetBreaker); });

  it('falls straight through to the healthy mirror once the first is standing down', async () => {
    // kumi 429s, overpass-api.de answers. Both mirrors are tried the first time.
    fetchSpy.mockImplementation((async (input: RequestInfo | URL) => (
      String(input).includes('kumi')
        ? res(429)
        : { ok: true, status: 200, json: async () => ({ elements: [{ tags: { name: 'Café' } }] }), text: async () => '' } as unknown as Response
    )) as typeof fetch);

    expect(await fetchOverpassPlaces(48.2, 16.4, 'restaurants', 3000)).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Now kumi is skipped — a 13-second timeout saved on every subsequent call.
    fetchSpy.mockClear();
    expect(await fetchOverpassPlaces(48.2, 16.4, 'restaurants', 3000)).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('overpass-api.de');
  });

  it('reports "throttled", not "outage", when every mirror is standing down', async () => {
    // The distinction matters: one is somebody else's capacity and belongs in a
    // breaker line, the other is a real fault that should reach Sentry.
    fetchSpy.mockResolvedValue(res(504));
    await expect(fetchOverpassPlaces(48.2, 16.4, 'restaurants', 3000)).rejects.toThrow(/Overpass 504/);

    await expect(fetchOverpassPlaces(48.2, 16.4, 'restaurants', 3000))
      .rejects.toBeInstanceOf(OverpassThrottledError);
  });

  it('still surfaces a genuine failure as a genuine failure', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));
    const err = await fetchOverpassPlaces(48.2, 16.4, 'restaurants', 3000).catch(e => e);
    // A network error opens no breaker — the mirrors may be fine next time.
    expect(err).not.toBeInstanceOf(OverpassThrottledError);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
