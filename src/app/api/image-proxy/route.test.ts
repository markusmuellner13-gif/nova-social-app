// End-to-end checks for the proxy route itself: a mocked upstream and a mocked
// resolver, but the real sharp pipeline and the real decision flow.
//
// The route's failure paths are what these are here for. Every one of them used
// to be the same uncached 502, and a 502 is the one answer that tells you
// nothing about what happened and makes every viewer of the same dead photo pay
// for finding out again.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { GET } from './route';

// Deterministic DNS: the SSRF guard must be exercised without depending on what
// the machine running the tests can actually resolve.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (hostname: string) => {
    if (hostname === 'private.example.com') return [{ address: '10.0.0.5', family: 4 }];
    if (hostname === 'nxdomain.example.com') throw new Error('ENOTFOUND');
    return [{ address: '93.184.216.34', family: 4 }];
  }),
}));

const realFetch = globalThis.fetch;
afterAll(() => { globalThis.fetch = realFetch; });
beforeEach(() => { vi.restoreAllMocks(); });

function photo(width = 2000, height = 1200): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#4488cc' } })
    .jpeg().toBuffer();
}

function upstream(body: Buffer | string, init: ResponseInit & { type?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.type) headers.set('Content-Type', init.type);
  return new Response(typeof body === 'string' ? body : new Uint8Array(body), { ...init, headers });
}

function request(url: string, accept = 'image/avif,image/webp,*/*') {
  return new NextRequest(
    `https://nova.app/api/image-proxy?url=${encodeURIComponent(url)}&w=1080`,
    { headers: { accept } },
  );
}

describe('image-proxy — the happy path', () => {
  it('renders an upstream photo to AVIF at the requested width', async () => {
    const src = await photo();
    globalThis.fetch = vi.fn(async () => upstream(src, { type: 'image/jpeg' })) as never;

    const res = await GET(request('https://upload.wikimedia.org/wikipedia/commons/x.jpg'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/avif');
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=2592000');
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.width).toBe(1080);
  });

  it('falls back to the original URL when the upgraded variant is missing', async () => {
    const src = await photo(600, 400);
    const asked: string[] = [];
    globalThis.fetch = vi.fn(async (u: string) => {
      asked.push(String(u));
      return String(u).includes('1280px')
        ? upstream('nope', { status: 404, type: 'text/plain' })
        : upstream(src, { type: 'image/jpeg' });
    }) as never;

    const res = await GET(request('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/F.JPG/330px-F.JPG'));

    expect(res.status).toBe(200);
    expect(asked.map(u => (u.includes('1280px') ? 'upgraded' : 'original'))).toEqual(['upgraded', 'original']);
  });

  it('follows a redirect to another public host', async () => {
    const src = await photo(800, 600);
    globalThis.fetch = vi.fn(async (u: string) =>
      String(u).includes('cdn.evbuc.com')
        ? upstream('', { status: 302, headers: { location: 'https://images.example.com/a.jpg' } })
        : upstream(src, { type: 'binary/octet-stream' })) as never;

    const res = await GET(request('https://cdn.evbuc.com/images/1/2/3/original.x'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/avif');
  });
});

describe('image-proxy — failures answer with the truth, and cache it', () => {
  it('answers a dead upstream image with a cacheable 404 rather than a 502', async () => {
    globalThis.fetch = vi.fn(async () => upstream('gone', { status: 404, type: 'text/plain' })) as never;

    const res = await GET(request('https://cdn.evbuc.com/images/1/2/3/original.x'));

    expect(res.status).toBe(404);
    expect(res.headers.get('X-Proxy-Reason')).toBe('gone');
    // The CDN answers the next viewer, so one dead photo is one upstream fetch.
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=21600');
  });

  it('retries once when the single candidate hits a transient failure', async () => {
    const src = await photo(400, 400);
    let attempts = 0;
    globalThis.fetch = vi.fn(async () => {
      if (attempts++ === 0) throw new TypeError('fetch failed');
      return upstream(src, { type: 'image/jpeg' });
    }) as never;

    const res = await GET(request('https://cdn.evbuc.com/images/9/9/9/original.x'));

    expect(res.status).toBe(200);
    expect(attempts).toBe(2);
  });

  it('reports a persistent timeout as 504, cached only briefly', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    }) as never;

    const res = await GET(request('https://cdn.evbuc.com/images/9/9/9/original.x'));

    expect(res.status).toBe(504);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=60');
  });

  it('keeps 502 for a genuinely broken upstream', async () => {
    globalThis.fetch = vi.fn(async () => upstream('boom', { status: 503, type: 'text/plain' })) as never;

    const res = await GET(request('https://cdn.evbuc.com/images/9/9/9/original.x'));

    expect(res.status).toBe(502);
  });

  it('treats an unresolvable host as passing, not as a settled block', async () => {
    globalThis.fetch = vi.fn() as never;

    const res = await GET(request('https://nxdomain.example.com/a.jpg'));

    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=60');
  });

  it('rejects an HTML error page served in place of a photo', async () => {
    globalThis.fetch = vi.fn(async () => upstream('<html>404</html>', { type: 'text/html' })) as never;

    expect((await GET(request('https://cdn.evbuc.com/images/1/2/3/original.x'))).status).toBe(415);
  });

  it('stops reading a body that runs past the size cap', async () => {
    // Endless "image" with no Content-Length — previously buffered in full
    // before anyone measured it, which costs the function its memory.
    const endless = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(1024 * 1024)); } });
    globalThis.fetch = vi.fn(async () =>
      new Response(endless, { headers: { 'Content-Type': 'image/jpeg' } })) as never;

    expect((await GET(request('https://cdn.evbuc.com/images/1/2/3/original.x'))).status).toBe(413);
  });

  it('treats a connection that dies mid-download as an upstream failure', async () => {
    let attempts = 0;
    globalThis.fetch = vi.fn(async () => {
      attempts++;
      const dying = new ReadableStream({
        start(c) { c.enqueue(new Uint8Array(1024)); c.error(new Error('socket hang up')); },
      });
      return new Response(dying, { headers: { 'Content-Type': 'image/jpeg' } });
    }) as never;

    const res = await GET(request('https://cdn.evbuc.com/images/1/2/3/original.x'));

    expect(res.status).toBe(502);       // not a 500 of our own
    expect(attempts).toBe(2);           // and it was worth one retry
  });

  it('passes an image sharp cannot render through with a type read from the bytes', async () => {
    const ico = Buffer.concat([Buffer.from([0, 0, 1, 0, 1, 0]), Buffer.alloc(64)]);
    globalThis.fetch = vi.fn(async () => upstream(ico, { type: 'binary/octet-stream' })) as never;

    const res = await GET(request('https://cdn.evbuc.com/favicon.ico'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/x-icon');
  });
});

describe('image-proxy — the SSRF guard', () => {
  it('refuses a host that resolves into the private network', async () => {
    globalThis.fetch = vi.fn() as never;

    const res = await GET(request('https://private.example.com/a.jpg'));

    expect(res.status).toBe(403);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('refuses a redirect into the private network', async () => {
    globalThis.fetch = vi.fn(async () =>
      upstream('', { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } })) as never;

    expect((await GET(request('https://cdn.evbuc.com/images/1/2/3/original.x'))).status).toBe(403);
  });

  it('never serves an SVG from our own origin', async () => {
    globalThis.fetch = vi.fn(async () =>
      upstream('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', { type: 'image/svg+xml' })) as never;

    const res = await GET(request('https://cdn.evbuc.com/a.svg'));

    expect(res.headers.get('Content-Type')).not.toContain('svg');
  });

  it('rejects a non-https target without touching the network', async () => {
    globalThis.fetch = vi.fn() as never;

    const res = await GET(request('http://cdn.evbuc.com/a.jpg'));

    expect(res.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('answers a missing url param with 400', async () => {
    expect((await GET(new NextRequest('https://nova.app/api/image-proxy'))).status).toBe(400);
  });
});
