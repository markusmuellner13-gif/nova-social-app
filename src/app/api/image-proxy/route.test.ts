import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

// What this file pins down: a dead third-party photo must not be reported as
// Nova failing, and must not be re-fetched forever.
//
// Both used to be wrong. Every unusable upstream came back as a bare 502 with
// no `Cache-Control`, so one expired image link produced a burst of 5xx alert
// mail AND was re-fetched by every viewer at every srcset width, indefinitely.

// s1.ticketm.net is a trusted host (no DNS lookup) with no upgrade rule, so the
// request URL and the fetched URL are identical — the "no second chance to
// take" path, which is exactly where the bare 502 used to come from.
const DIRECT = 'https://s1.ticketm.net/dam/a/001/photo.jpg';
// img.evbuc.com upgrades to the unsigned cdn.evbuc.com original, so this one
// takes two attempts before it gives up.
const UPGRADES =
  'https://img.evbuc.com/https%3A%2F%2Fcdn.evbuc.com%2Fimages%2F1%2F2%2F1%2Foriginal.jpg?w=512&s=abc';

function get(url: string) {
  return GET(new NextRequest(`https://nova.test/api/image-proxy?url=${encodeURIComponent(url)}&w=1080`));
}

/** Mock upstream: `results` is consumed one entry per fetch, in order. */
function upstream(...results: (Response | Error)[]) {
  const fetchMock = vi.fn(async () => {
    const next = results.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error('unexpected extra fetch');
    return next;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function maxAge(res: Response): number {
  return parseInt(/max-age=(\d+)/.exec(res.headers.get('Cache-Control') ?? '')?.[1] ?? '-1', 10);
}

afterEach(() => vi.unstubAllGlobals());

describe('image-proxy failure classification', () => {
  it('reports a photo the source refuses as 404, not 502', async () => {
    // The alert that started this: a Facebook-CDN link whose signature had
    // expired. 403 from someone else's CDN is not this server failing.
    upstream(new Response('nope', { status: 403 }));
    const res = await get(DIRECT);

    expect(res.status).toBe(404);
    expect(res.headers.get('X-Nova-Proxy-Reason')).toBe('Upstream 403');
  });

  it('reports a deleted photo as 404', async () => {
    upstream(new Response('gone', { status: 404 }));
    expect((await get(DIRECT)).status).toBe(404);
  });

  it('caches a permanently-dead photo for a day', async () => {
    // The second half of the bug. With no cache lifetime the edge re-ran the
    // whole dead fetch for every viewer and every srcset width, which is how
    // one broken photo became a steady drip of logged failures.
    upstream(new Response('nope', { status: 403 }));
    expect(maxAge(await get(DIRECT))).toBe(86_400);
  });

  it('still reports a genuinely broken upstream as 502', async () => {
    // A 5xx from the source IS worth alerting on if it persists — the fix is
    // about honesty, not about silencing everything.
    upstream(new Response('boom', { status: 503 }));
    const res = await get(DIRECT);

    expect(res.status).toBe(502);
    expect(res.headers.get('X-Nova-Proxy-Reason')).toBe('Upstream 503');
  });

  it('reports an unreachable upstream as 502, held only briefly', async () => {
    upstream(new Error('timeout'));
    const res = await get(DIRECT);

    expect(res.status).toBe(502);
    // Short, because the source may well be back in a minute.
    expect(maxAge(res)).toBe(60);
  });

  it('reports a page served where a photo should be as 404', async () => {
    // A venue whose og:image points at its own homepage. There is no image at
    // this URL and there never will be.
    upstream(new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    const res = await get(DIRECT);

    expect(res.status).toBe(404);
    expect(maxAge(res)).toBe(86_400);
  });

  it('falls back to the untouched source before giving up', async () => {
    // The upgraded variant may simply not exist; only when the source's own URL
    // fails too is the photo actually gone.
    const fetchMock = upstream(
      new Response('no such variant', { status: 404 }),
      new Response('gone too', { status: 404 }),
    );
    const res = await get(UPGRADES);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('cdn.evbuc.com');
    expect(fetchMock.mock.calls[1][0]).toContain('img.evbuc.com');
    expect(res.status).toBe(404);
  });

  it('rejects a URL it will not fetch, and remembers that it did', async () => {
    const res = await GET(new NextRequest('https://nova.test/api/image-proxy'));

    expect(res.status).toBe(400);
    expect(maxAge(res)).toBe(86_400);
  });
});
