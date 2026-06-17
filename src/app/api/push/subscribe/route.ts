import { NextRequest, NextResponse } from 'next/server';
import { cacheEnabled, cacheSet } from '@/lib/serverCache';

// Stores a web-push subscription so the backend can later send "event near you"
// pushes. Persists in Redis when configured; otherwise accepts and no-ops (the
// app's in-session local reminders keep working regardless).
export async function POST(request: NextRequest) {
  try {
    const sub = await request.json() as { endpoint?: string };
    if (!sub?.endpoint) {
      return NextResponse.json({ ok: false, error: 'invalid subscription' }, { status: 400 });
    }
    if (cacheEnabled) {
      // Key by a hash of the endpoint so re-subscribing overwrites cleanly.
      let h = 2166136261;
      for (let i = 0; i < sub.endpoint.length; i++) { h ^= sub.endpoint.charCodeAt(i); h = Math.imul(h, 16777619); }
      await cacheSet(`nova:push:sub:${(h >>> 0).toString(36)}`, sub, 60 * 60 * 24 * 60); // 60 days
    }
    return NextResponse.json({ ok: true, stored: cacheEnabled });
  } catch {
    return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 });
  }
}
