import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { venueParts, isAtCityCentre, geocodeVenue, backfillVenueCoords } from './venueGeo';
import type { ApiPost } from './shared';

const VIENNA = { lat: 48.2082, lng: 16.3738 };

const post = (over: Partial<ApiPost> = {}): ApiPost => ({
  id: 'p', user: {} as never, image: '', caption: 'c', likes: 0, comments: 0,
  category: 'events', hashtags: [], timestamp: 0,
  location: { name: 'Wien', lat: VIENNA.lat, lng: VIENNA.lng },
  saved: false, liked: false, isEvent: true, isAIGenerated: false,
  ...over,
} as ApiPost);

describe('venueParts', () => {
  it('splits the real shape the crawler produces', () => {
    const p = post({ eventVenue: 'Shebeen International Pub, 45 Lerchenfelder Straße, Wien' });
    expect(venueParts(p, 'Wien')).toEqual({
      name: 'Shebeen International Pub',
      street: '45 Lerchenfelder Straße',
      city: 'Wien',
    });
  });

  it('prefers the segment carrying a house number as the street', () => {
    const p = post({ eventVenue: 'Zoku Vienna, Stuwerviertel, 6 Perspektivstraße, Wien' });
    expect(venueParts(p, 'Wien').street).toBe('6 Perspektivstraße');
  });

  it('does not mistake the city for the venue name', () => {
    const p = post({ eventVenue: 'Wien' });
    const parts = venueParts(p, 'Wien');
    expect(parts.name).toBe('');
    expect(parts.street).toBe('');
  });

  it('falls back to location.name when there is no eventVenue', () => {
    const p = post({ location: { name: 'Juwel Wien, 1 Taborstraße', lat: 0, lng: 0 } });
    expect(venueParts(p, 'Wien').name).toBe('Juwel Wien');
  });
});

describe('isAtCityCentre', () => {
  it('is true for the fallback coordinates the crawler stamps on', () => {
    expect(isAtCityCentre(post(), VIENNA.lat, VIENNA.lng)).toBe(true);
  });
  it('is false once a post has real venue coordinates', () => {
    const p = post({ location: { name: 'x', lat: 48.2107, lng: 16.3480 } }); // ~1.9km away
    expect(isAtCityCentre(p, VIENNA.lat, VIENNA.lng)).toBe(false);
  });
  it('treats a post with no coordinates as unlocated', () => {
    expect(isAtCityCentre(post({ location: undefined as never }), VIENNA.lat, VIENNA.lng)).toBe(true);
  });
});

describe('geocodeVenue', () => {
  const okRow = (lat: number, lon: number) =>
    ({ ok: true, json: async () => [{ lat: String(lat), lon: String(lon) }] }) as Response;

  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('accepts a nearby hit from the structured street query', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okRow(48.2054, 16.3510));
    const out = await geocodeVenue(
      { name: 'Shebeen', street: '45 Lerchenfelder Straße', city: 'Vienna' },
      { cityLat: VIENNA.lat, cityLng: VIENNA.lng },
    );
    expect(out).toEqual({ lat: 48.2054, lng: 16.3510 });
    expect(String(fetchMock.mock.calls[0][0])).toContain('street=');
  });

  it('REJECTS a name collision on another continent rather than misplacing the post', async () => {
    // "Juwel" also exists in Germany; a wrong coordinate is worse than a coarse one.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okRow(52.52, 13.405)); // Berlin
    const out = await geocodeVenue(
      { name: 'Juwel', street: '', city: 'Vienna' },
      { cityLat: VIENNA.lat, cityLng: VIENNA.lng },
    );
    expect(out).toBeNull();
  });

  it('falls through to the next query form when the first finds nothing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValueOnce(okRow(48.2054, 16.3510));
    const out = await geocodeVenue(
      { name: 'Zoku Vienna', street: '6 Perspektivstraße', city: 'Vienna' },
      { cityLat: VIENNA.lat, cityLng: VIENNA.lng },
    );
    expect(out).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up cleanly when there is nothing to search on', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    expect(await geocodeVenue({ name: '', street: '', city: 'Vienna' },
      { cityLat: VIENNA.lat, cityLng: VIENNA.lng })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('backfillVenueCoords', () => {
  afterEach(() => vi.restoreAllMocks());

  it('leaves already-located posts alone', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const located = post({ location: { name: 'x', lat: 48.2107, lng: 16.3480 } });
    const out = await backfillVenueCoords([located], { city: 'Vienna', cityLat: VIENNA.lat, cityLng: VIENNA.lng });
    expect(out.attempted).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws the ingest slice — a dead geocoder just means coarse posts', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const p = post({ eventVenue: 'Somewhere, 1 Test Straße, Wien' });
    const out = await backfillVenueCoords([p], { city: 'Wien', cityLat: VIENNA.lat, cityLng: VIENNA.lng, budgetMs: 200 });
    expect(out.located).toBe(0);
    expect(out.posts[0].location?.lat).toBe(VIENNA.lat); // unchanged
  });

  it('survives an empty batch', async () => {
    const out = await backfillVenueCoords([], { city: 'Vienna', cityLat: VIENNA.lat, cityLng: VIENNA.lng });
    expect(out).toEqual({ posts: [], located: 0, attempted: 0 });
  });

  // This runs inside the ingest route's per-item window, after a fetch that can
  // already take 24s of the 60s the platform allows. If the budget is advisory,
  // one venue's three-step cascade — each step pacing then waiting on a hung
  // Nominatim — runs ~15s past it and the function is killed mid-item, which
  // throws away the slice's upsert. The budget has to be a real ceiling.
  it('honours its budget even when every lookup hangs', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_u, init) => new Promise((_res, rej) => {
        // Behave like a hung server: only ever settle via the caller's abort.
        (init as RequestInit)?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
      }) as Promise<Response>,
    );
    const posts = Array.from({ length: 5 }, () =>
      post({ eventVenue: 'Somewhere, 1 Test Straße, Wien' }));

    const startedAt = Date.now();
    const out = await backfillVenueCoords(posts, {
      city: 'Wien', cityLat: VIENNA.lat, cityLng: VIENNA.lng, budgetMs: 1000,
    });
    const elapsed = Date.now() - startedAt;

    expect(out.located).toBe(0);
    // Generous, but far below the ~15s a single unbounded cascade would take.
    expect(elapsed).toBeLessThan(3000);
  });
});
