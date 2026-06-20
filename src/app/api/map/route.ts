import { NextResponse } from 'next/server';
import { dbReadEnabled, sampleEventsWorldwide } from '@/lib/eventsDb';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/map — a worldwide spread of real, live events for the globe view.
//
// Reads straight from our own events DB (the same rows that power the feed), so
// the World Map shows genuine concerts/markets/exhibitions worldwide rather than
// demo posts. Returns an empty list when the DB isn't configured; the client
// then falls back to its local sample so the map is never blank.
// ─────────────────────────────────────────────────────────────────────────────

export const maxDuration = 30;

export async function GET() {
  if (!dbReadEnabled) {
    return NextResponse.json({ posts: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const posts = await sampleEventsWorldwide(450);
    return NextResponse.json(
      { posts, count: posts.length },
      // Cache hard at the edge — the worldwide set changes slowly and this is
      // read by every Explore-tab open.
      { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' } },
    );
  } catch {
    return NextResponse.json({ posts: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
