import { NextRequest, NextResponse } from 'next/server';
import { cacheEnabled, cacheIncr, cacheGet } from '@/lib/serverCache';

// ─────────────────────────────────────────────────────────────────────────────
// Advertiser analytics (#9) — impressions & clicks per sponsored post.
//
// POST { type: 'impression' | 'click', id } → increments a Redis counter so a
// business can be shown real ROI ("12,430 impressions · 318 clicks this month").
// GET ?id=… → returns the current counts (for a future advertiser dashboard).
//
// No-ops without Redis configured. Designed to be called via navigator.sendBeacon
// so it never blocks the UI.
// ─────────────────────────────────────────────────────────────────────────────

function bucket(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`; // YYYYMM
}

export async function POST(request: NextRequest) {
  let body: { type?: string; id?: string } = {};
  try { body = await request.json(); } catch { /* sendBeacon may send text */ }

  const type = body.type === 'click' ? 'click' : 'impression';
  const id = (body.id || '').slice(0, 80).replace(/[^a-zA-Z0-9_:.-]/g, '');
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  if (cacheEnabled) {
    await cacheIncr(`nova:stats:${type}:${id}:${bucket()}`, 60 * 60 * 24 * 90); // 90-day retention
  }
  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  const id = (new URL(request.url).searchParams.get('id') || '').slice(0, 80);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const b = bucket();
  const impressions = (await cacheGet<number>(`nova:stats:impression:${id}:${b}`)) ?? 0;
  const clicks      = (await cacheGet<number>(`nova:stats:click:${id}:${b}`)) ?? 0;
  return NextResponse.json({ ok: true, id, month: b, impressions, clicks });
}
