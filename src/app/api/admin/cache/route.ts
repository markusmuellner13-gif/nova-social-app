import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { cacheClearPrefix } from '@/lib/serverCache';

// Admin: purge the feed cache so corrected DB data / ranking changes show up
// immediately instead of waiting out the TTL (place categories cache for 6h).
// Header-only Bearer auth (ADMIN_SECRET, falls back to CRON_SECRET).
//   POST {action:'clearFeed'}  → clear every cached feed page (nova:events:*)
//   POST {action:'clearGeo'}   → clear cached geocode lookups (nova:geocode:*)

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function authed(request: NextRequest): boolean {
  const provided = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!provided) return false;
  // Cache purge is a benign ops action (just forces a recompute), so accept
  // EITHER the admin secret or the cron secret.
  for (const secret of [process.env.ADMIN_SECRET, process.env.CRON_SECRET]) {
    if (secret && safeEqual(provided, secret)) return true;
  }
  return false;
}

export async function POST(request: NextRequest) {
  if (!authed(request)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  let body: { action?: string } = {};
  try { body = await request.json(); } catch { /* keep empty */ }

  if (body.action === 'clearFeed') {
    const deleted = await cacheClearPrefix('nova:events:');
    return NextResponse.json({ ok: true, action: 'clearFeed', deletedKeys: deleted });
  }
  if (body.action === 'clearGeo') {
    const deleted = await cacheClearPrefix('nova:geocode:');
    return NextResponse.json({ ok: true, action: 'clearGeo', deletedKeys: deleted });
  }
  return NextResponse.json({ ok: false, error: 'unknown action (clearFeed | clearGeo)' }, { status: 400 });
}

export const dynamic = 'force-dynamic';
