import { NextRequest, NextResponse } from 'next/server';
import { cacheClearPrefix } from '@/lib/serverCache';
import { isAdminRequest } from '@/lib/adminAuth';

// Admin: purge the feed cache so corrected DB data / ranking changes show up
// immediately instead of waiting out the TTL (place categories cache for 6h).
// Header-only Bearer auth — see src/lib/adminAuth.ts. Once ADMIN_SECRET is set,
// CRON_SECRET no longer opens this route. This used to accept EITHER secret
// unconditionally, which meant the widely-copied cron secret was permanently an
// admin key no matter what else you configured.
//   POST {action:'clearFeed'}  → clear every cached feed page (nova:events:*)
//   POST {action:'clearGeo'}   → clear cached geocode lookups (nova:geocode:*)

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
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
