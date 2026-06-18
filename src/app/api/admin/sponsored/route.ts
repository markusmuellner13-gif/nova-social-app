import { NextRequest, NextResponse } from 'next/server';
import { cacheClearPrefix, cacheDelete } from '@/lib/serverCache';
import { listSponsored } from '@/lib/sponsored';
import { slugify } from '@/lib/sources/shared';

// Admin: inspect / clear sponsored posts. Protected by CRON_SECRET.
// GET  ?secret=…&city=Rome           → list that city's live sponsored posts
// POST ?secret=…  body {action:'clearAll'}            → wipe every sponsored post
// POST ?secret=…  body {action:'clearCity', city}     → wipe one city's posts
function authed(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // refuse if no secret configured
  const url = new URL(request.url);
  const provided = url.searchParams.get('secret')
    ?? (request.headers.get('authorization') || '').replace('Bearer ', '');
  return provided === secret;
}

export async function GET(request: NextRequest) {
  if (!authed(request)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const city = new URL(request.url).searchParams.get('city') || '';
  if (!city) return NextResponse.json({ ok: false, error: 'pass ?city=' }, { status: 400 });
  const posts = await listSponsored(city);
  return NextResponse.json({ ok: true, city, count: posts.length, posts });
}

export async function POST(request: NextRequest) {
  if (!authed(request)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
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
