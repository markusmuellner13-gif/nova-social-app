import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { looksLikeLogo, tooSmall, websiteFromTags, extractPageImages, osmTagImage, isDirectoryUrl, fetchGooglePlacePhoto } from './venuePhoto';
import { resetBreaker } from '@/lib/sourceBreaker';

describe('isDirectoryUrl', () => {
  // openstreetmap.org node pages really do serve the OSM logo as og:image, so
  // treating one as "the venue's page" would stamp that logo onto every place
  // that has no website — a wrong picture on hundreds of unrelated posts.
  it('recognises map databases that are not the venue', () => {
    expect(isDirectoryUrl('https://www.openstreetmap.org/node/33303842')).toBe(true);
    expect(isDirectoryUrl('https://osm.org/way/12')).toBe(true);
  });

  it('leaves the venue and event pages alone', () => {
    expect(isDirectoryUrl('https://trattoria-roma.it/')).toBe(false);
    expect(isDirectoryUrl('https://www.eventbrite.com/e/rooftop-123')).toBe(false);
    expect(isDirectoryUrl('https://en.wikipedia.org/wiki/Colosseum')).toBe(false);
    expect(isDirectoryUrl('not a url')).toBe(false);
  });

  it('rejects the OSM logo through the logo guard as well', () => {
    expect(looksLikeLogo('https://www.openstreetmap.org/assets/osm_logo_256-ed028f.png')).toBe(true);
  });
});

describe('looksLikeLogo', () => {
  it('rejects the artwork that is not a photograph', () => {
    expect(looksLikeLogo('https://x.io/assets/logo.png')).toBe(true);
    expect(looksLikeLogo('https://x.io/favicon-32.png')).toBe(true);
    expect(looksLikeLogo('https://x.io/img/brand.svg')).toBe(true);
    expect(looksLikeLogo('https://x.io/apple-touch-icon.png')).toBe(true);
    expect(looksLikeLogo('https://x.io/og-default.jpg')).toBe(true);
  });

  it('accepts real photography', () => {
    expect(looksLikeLogo('https://x.io/uploads/2026/dining-room.jpg')).toBe(false);
    expect(looksLikeLogo('https://x.io/media/hero-terrace.webp')).toBe(false);
    // "logo" inside a longer word must not trip it
    expect(looksLikeLogo('https://x.io/img/logotherapy-clinic.jpg')).toBe(false);
  });
});

describe('tooSmall', () => {
  it('rejects images that cannot fill a card', () => {
    expect(tooSmall(200, 200)).toBe(true);
    expect(tooSmall(1200, 300)).toBe(true);
  });
  it('passes card-sized images and unknown sizes', () => {
    expect(tooSmall(1200, 800)).toBe(false);
    expect(tooSmall(undefined, undefined)).toBe(false);
  });
});

describe('websiteFromTags', () => {
  it('reads every key OSM records a business site under', () => {
    expect(websiteFromTags({ 'contact:website': 'https://a.io' })).toBe('https://a.io');
    expect(websiteFromTags({ 'operator:website': 'https://b.io' })).toBe('https://b.io');
    expect(websiteFromTags({ url: 'https://c.io' })).toBe('https://c.io');
  });
  it('repairs a scheme-less tag', () => {
    expect(websiteFromTags({ website: 'trattoria-roma.it' })).toBe('https://trattoria-roma.it');
  });
  it('prefers the canonical key and ignores junk', () => {
    expect(websiteFromTags({ website: 'https://real.io', url: 'https://other.io' })).toBe('https://real.io');
    expect(websiteFromTags({ website: '   ' })).toBe('');
    expect(websiteFromTags({})).toBe('');
  });
});

describe('extractPageImages', () => {
  const page = 'https://venue.example/about';

  it('finds the og:image', () => {
    const html = `<meta property="og:image" content="https://venue.example/hero.jpg">`;
    expect(extractPageImages(html, page)[0].url).toBe('https://venue.example/hero.jpg');
  });

  it('prefers a real photo over the site logo, whatever the tag order', () => {
    const html = `
      <meta property="og:image" content="/assets/logo.png">
      <meta name="twitter:image" content="/media/dining-room.jpg">`;
    expect(extractPageImages(html, page)[0].url).toBe('https://venue.example/media/dining-room.jpg');
  });

  it('reads photography out of JSON-LD when the meta tags only have a logo', () => {
    const html = `
      <meta property="og:image" content="/assets/logo.png">
      <script type="application/ld+json">
      {"@type":"Restaurant","name":"Da Marco","image":["https://cdn.io/terrace.jpg"]}
      </script>`;
    expect(extractPageImages(html, page)[0].url).toBe('https://cdn.io/terrace.jpg');
  });

  it('resolves relative URLs against the page', () => {
    const html = `<meta property="og:image" content="//cdn.io/x.jpg">`;
    expect(extractPageImages(html, page)[0].url).toBe('https://cdn.io/x.jpg');
  });

  it('drops images the page declares too small for a card', () => {
    const html = `
      <meta property="og:image" content="https://venue.example/thumb.jpg">
      <meta property="og:image:width" content="200">
      <meta property="og:image:height" content="150">`;
    expect(extractPageImages(html, page)).toHaveLength(0);
  });

  it('deduplicates and survives malformed JSON-LD', () => {
    const html = `
      <meta property="og:image" content="https://cdn.io/a.jpg">
      <meta name="twitter:image" content="https://cdn.io/a.jpg">
      <script type="application/ld+json">{ not json }</script>`;
    expect(extractPageImages(html, page)).toHaveLength(1);
  });

  it('returns nothing for a page that advertises no image', () => {
    expect(extractPageImages('<html><head><title>x</title></head></html>', page)).toEqual([]);
  });
});

describe('osmTagImage', () => {
  it('takes a direct image tag', () => {
    expect(osmTagImage({ image: 'https://x.io/venue.jpg' })).toBe('https://x.io/venue.jpg');
  });
  it('builds a Commons FilePath URL at card resolution', () => {
    expect(osmTagImage({ wikimedia_commons: 'File:Stephansdom.jpg' }))
      .toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Stephansdom.jpg?width=1600');
  });
  it('converts a Commons description-page URL into the actual file', () => {
    // Mappers paste these into `image`; the page serves HTML, so the browser
    // blocks it (ERR_BLOCKED_BY_ORB) and the card loses its photo.
    expect(osmTagImage({ image: 'https://commons.wikimedia.org/wiki/File:Mautwirtshaus.jpg' }))
      .toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Mautwirtshaus.jpg?width=1600');
    expect(osmTagImage({ image: 'https://de.wikipedia.org/wiki/Datei:Alte%20M%C3%BChle.jpg' }))
      .toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Alte%20M%C3%BChle.jpg?width=1600');
  });

  it('refuses a logo sitting in the image tag', () => {
    expect(osmTagImage({ image: 'https://x.io/logo.png' })).toBeNull();
  });
  it('returns null when the place has no image tag', () => {
    expect(osmTagImage({ name: 'Bar' })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The LEGACY Places fallback has been answering REQUEST_DENIED since Aug 5 —
// "This API key is not authorized to use this service". That is a setting on the
// key in Google Cloud Console; no amount of calling changes it. Until this fix
// the app asked again on every single photo miss, paying a full round trip for
// an answer it had already been given eleven times.
// ─────────────────────────────────────────────────────────────────────────────
describe('Google Places legacy fallback', () => {
  const KEY_BEFORE = process.env.GOOGLE_PLACES_API_KEY;
  const LEGACY_BEFORE = process.env.GOOGLE_PLACES_LEGACY;
  let n = 0;
  const venue = () => `Test Venue ${++n}`;   // the photo cache memoises by name

  beforeEach(() => {
    resetBreaker('places-legacy');
    resetBreaker('places-new');
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    delete process.env.GOOGLE_PLACES_LEGACY;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    resetBreaker('places-legacy');
    if (KEY_BEFORE === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = KEY_BEFORE;
    if (LEGACY_BEFORE === undefined) delete process.env.GOOGLE_PLACES_LEGACY;
    else process.env.GOOGLE_PLACES_LEGACY = LEGACY_BEFORE;
  });

  // Modern API answers, finds nothing → the legacy fallback is tried.
  function stubFetch(legacyStatus: string) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('places.googleapis.com')) {
        return { ok: true, status: 200, json: async () => ({ places: [] }), text: async () => '{}' } as unknown as Response;
      }
      return {
        ok: true, status: 200,
        json: async () => ({ status: legacyStatus, error_message: 'This API key is not authorized to use this service.' }),
        text: async () => '{}',
      } as unknown as Response;
    }) as typeof fetch);
  }

  it('asks legacy once, then never again — REQUEST_DENIED is a config answer', async () => {
    const spy = stubFetch('REQUEST_DENIED');

    // First lookup: modern API, then the legacy fallback. Two requests.
    expect(await fetchGooglePlacePhoto(venue(), 48.2, 16.37)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);

    // Every lookup after it skips legacy entirely — one request, not two.
    spy.mockClear();
    for (let i = 0; i < 5; i++) await fetchGooglePlacePhoto(venue(), 48.2, 16.37);
    expect(spy).toHaveBeenCalledTimes(5);
    expect(spy.mock.calls.every(c => String(c[0]).includes('places.googleapis.com'))).toBe(true);
  });

  it('keeps trying legacy after a ZERO_RESULTS — that is a normal answer', async () => {
    const spy = stubFetch('ZERO_RESULTS');
    await fetchGooglePlacePhoto(venue(), 48.2, 16.37);
    spy.mockClear();
    await fetchGooglePlacePhoto(venue(), 48.2, 16.37);
    expect(spy).toHaveBeenCalledTimes(2);   // modern + legacy, still both
  });

  it('GOOGLE_PLACES_LEGACY=off retires the fallback without waiting for a denial', async () => {
    process.env.GOOGLE_PLACES_LEGACY = 'off';
    const spy = stubFetch('REQUEST_DENIED');
    await fetchGooglePlacePhoto(venue(), 48.2, 16.37);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('names the actual fix in the log line', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubFetch('REQUEST_DENIED');
    await fetchGooglePlacePhoto(venue(), 48.2, 16.37);
    const lines = log.mock.calls.map(c => c.join(' ')).join('\n');
    expect(lines).toContain('REQUEST_DENIED');
    expect(lines).toContain('Google Cloud Console');
  });
});
