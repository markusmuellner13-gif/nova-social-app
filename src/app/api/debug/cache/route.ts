import { NextResponse } from 'next/server';
import { cacheEnabled, cacheSet, cacheGet } from '@/lib/serverCache';

// TEMPORARY diagnostic — reports whether the Redis cache is wired, with a live
// set/get round-trip. Booleans only, no secret values exposed. Delete after use.
export const dynamic = 'force-dynamic';

export async function GET() {
  const probeKey = 'nova:debug:probe';
  let roundtrip = false;
  try {
    await cacheSet(probeKey, { t: Date.now() }, 30);
    roundtrip = !!(await cacheGet(probeKey));
  } catch { /* roundtrip stays false */ }

  const kvUrl = process.env.KV_REST_API_URL || '';
  const upUrl = process.env.UPSTASH_REDIS_REST_URL || '';
  return NextResponse.json({
    cacheEnabled,
    roundtrip,
    hasKvUrl: !!process.env.KV_REST_API_URL,
    kvUrlIsHttps: kvUrl.startsWith('https://'),
    hasKvToken: !!process.env.KV_REST_API_TOKEN,
    hasUpstashUrl: !!process.env.UPSTASH_REDIS_REST_URL,
    upstashUrlIsHttps: upUrl.startsWith('https://'),
    hasUpstashToken: !!process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}
