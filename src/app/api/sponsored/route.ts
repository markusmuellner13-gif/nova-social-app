import { NextRequest, NextResponse } from 'next/server';
import { listSponsored, sponsoredToFeedPost } from '@/lib/sponsored';

// Returns the active PAID sponsored posts for a city, geo-targeted: only people
// browsing that city see that city's partners. The feed injects these.
export async function GET(request: NextRequest) {
  const city = (new URL(request.url).searchParams.get('city') || '').slice(0, 80).trim();
  if (!city) return NextResponse.json({ posts: [] }, { headers: { 'Cache-Control': 'no-store' } });

  try {
    const stored = await listSponsored(city);
    const posts = stored.map(sponsoredToFeedPost);
    return NextResponse.json({ posts }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch {
    return NextResponse.json({ posts: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
