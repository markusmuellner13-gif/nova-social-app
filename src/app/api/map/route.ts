import { NextResponse } from 'next/server';
import { dbReadEnabled, sampleEventsWorldwide } from '@/lib/eventsDb';
import { cacheGet, cacheSet } from '@/lib/serverCache';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/map — a worldwide spread of real, live events for the globe view.
//
// Reads straight from our own events DB (the same rows that power the feed), so
// the World Map shows genuine concerts/markets/exhibitions worldwide rather than
// demo posts. Returns an empty list when the DB isn't configured; the client
// then falls back to its local sample so the map is never blank.
// ─────────────────────────────────────────────────────────────────────────────

export const maxDuration = 30;

// The anon role has a 3s statement timeout, and while an ingest run is writing
// the sample query can hit it (logged as "[eventsDb/sample] canceling statement
// due to statement timeout"). That used to hand every visitor in that window an
// EMPTY globe — and an empty Navigate map with no pins — for their whole
// session. Now: one retry, then the last good set from Redis.
const LAST_GOOD_KEY = 'nova:map:lastgood';
const LAST_GOOD_TTL_S = 24 * 60 * 60;
const RETRY_DELAY_MS = 400;

export async function GET() {
  if (!dbReadEnabled) {
    return NextResponse.json({ posts: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    let posts = await sampleEventsWorldwide(450);
    if (posts.length === 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      posts = await sampleEventsWorldwide(450);
    }
    if (posts.length === 0) {
      const lastGood = await cacheGet<typeof posts>(LAST_GOOD_KEY);
      if (lastGood?.length) {
        // Served from the fallback — cache it only briefly so the edge picks up
        // the live set again as soon as the database answers.
        return NextResponse.json(
          { posts: lastGood, count: lastGood.length, stale: true },
          { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
        );
      }
      return NextResponse.json({ posts: [], count: 0 }, { headers: { 'Cache-Control': 'no-store' } });
    }
    // Awaited: a serverless function can be frozen right after it responds,
    // and a fire-and-forget write would then never land.
    await cacheSet(LAST_GOOD_KEY, posts, LAST_GOOD_TTL_S);
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
