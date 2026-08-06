import { NextRequest, NextResponse } from 'next/server';
import { cacheClearPrefix, cacheDelete } from '@/lib/serverCache';
import { isAdminRequest } from '@/lib/adminAuth';
import { listSponsored } from '@/lib/sponsored';
import { slugify } from '@/lib/sources/shared';

// Admin: inspect / clear sponsored posts.
// Auth is HEADER-ONLY (Authorization: Bearer <secret>) so the secret never lands
// in server access logs or browser history the way a ?secret= query string would.
// Prefers a dedicated ADMIN_SECRET; falls back to CRON_SECRET for back-compat.
// See src/lib/adminAuth.ts — this route already had the correct behaviour; the
// shared helper is what makes the other two match it.
// GET  ?city=Rome                                  → list that city's sponsored posts
// POST body {action:'clearAll'}                    → wipe every sponsored post
// POST body {action:'clearCity', city}             → wipe one city's posts

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const city = new URL(request.url).searchParams.get('city') || '';
  if (!city) return NextResponse.json({ ok: false, error: 'pass ?city=' }, { status: 400 });
  const posts = await listSponsored(city);
  return NextResponse.json({ ok: true, city, count: posts.length, posts });
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  let body: { action?: string; city?: string } = {};
  try { body = await request.json(); } catch { /* keep empty */ }

  if (body.action === 'clearAll') {
    const deleted = await cacheClearPrefix('nova:sponsored:');
    return NextResponse.json({ ok: true, action: 'clearAll', deletedKeys: deleted });
  }
  if (body.action === 'clearCity' && body.city) {
    await cacheDelete(`nova:sponsored:${slugify(body.city)}`);
    return NextResponse.json({ ok: true, action: 'clearCity', city: body.city });
  }
  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
}

export const dynamic = 'force-dynamic';
