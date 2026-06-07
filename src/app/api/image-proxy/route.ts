import { NextRequest, NextResponse } from 'next/server';

// Allowlist of hostnames we are permitted to proxy.
// Only add domains whose terms allow server-side re-serving.
const ALLOWED_HOSTS = new Set([
  'images.unsplash.com',
  'images.pexels.com',
  'picsum.photos',
  'upload.wikimedia.org',
  's1.ticketm.net',
  's4.ticketm.net',
  'img.ticketmaster.com',
  'logo.clearbit.com',
  'i.pravatar.cc',
  'ui-avatars.com',
]);

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) return new NextResponse('Missing url param', { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return new NextResponse('Invalid URL', { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return new NextResponse('Host not allowed', { status: 403 });
  }

  // Only allow https
  if (parsed.protocol !== 'https:') {
    return new NextResponse('HTTPS only', { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(raw, {
      headers: {
        'User-Agent': 'Nova/1.0 (+https://nova-app.vercel.app)',
        Accept: 'image/*',
      },
      // Next.js Data Cache: keep for 24 h, revalidate stale after 1 h
      next: { revalidate: 86400 },
    });
  } catch {
    return new NextResponse('Upstream fetch failed', { status: 502 });
  }

  if (!upstream.ok) {
    return new NextResponse('Upstream error', { status: upstream.status });
  }

  const contentType = upstream.headers.get('Content-Type') ?? 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    return new NextResponse('Not an image', { status: 415 });
  }

  const body = await upstream.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // Browser: cache 1 day; CDN edge: cache 7 days; serve stale for 1 h while revalidating
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=3600',
    },
  });
}
