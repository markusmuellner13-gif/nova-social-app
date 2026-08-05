import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

// Admin: is the venue-photo pipeline actually working in THIS environment?
//
// Google Places is the difference between a real picture on ~89% of posts and
// one on nearly all of them, and it fails in a way that looks like success: the
// key is present and valid, but Google made the LEGACY Places endpoints
// unavailable to Cloud projects created after 1 March 2025, so `Places API
// (Legacy)` answers REQUEST_DENIED while the dashboard shows a healthy key.
// Production had exactly that: a key set, and zero Google photos in the feed.
//
// This endpoint asks Google directly and reports what it says, WITHOUT ever
// returning the key. Header-only Bearer auth (ADMIN_SECRET or CRON_SECRET).
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/admin/photos

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function authed(request: NextRequest): boolean {
  const provided = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!provided) return false;
  for (const secret of [process.env.ADMIN_SECRET, process.env.CRON_SECRET]) {
    if (secret && safeEqual(provided, secret)) return true;
  }
  return false;
}

interface Check { api: string; ok: boolean; status: number; detail?: string; photo?: string }

// A place Google certainly knows, so "no result" can only mean a broken setup.
const PROBE = { name: 'Stephansdom Wien', lat: 48.2085, lng: 16.3730 };

async function checkNew(key: string): Promise<Check> {
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.photos',
      },
      body: JSON.stringify({
        textQuery: PROBE.name,
        locationBias: { circle: { center: { latitude: PROBE.lat, longitude: PROBE.lng }, radius: 3000.0 } },
        maxResultCount: 1,
      }),
      signal: AbortSignal.timeout(6000),
    });
    const text = await res.text();
    if (!res.ok) {
      return { api: 'Places API (New)', ok: false, status: res.status, detail: text.slice(0, 300) };
    }
    const d = JSON.parse(text) as { places?: { photos?: { name?: string }[] }[] };
    const photoName = d.places?.[0]?.photos?.[0]?.name;
    return {
      api: 'Places API (New)',
      ok: !!photoName,
      status: res.status,
      detail: photoName ? undefined : 'reachable, but the probe place returned no photo',
      photo: photoName ? `${photoName.slice(0, 48)}…` : undefined,
    };
  } catch (err) {
    return { api: 'Places API (New)', ok: false, status: 0, detail: String(err).slice(0, 200) };
  }
}

async function checkLegacy(key: string): Promise<Check> {
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(PROBE.name)}&inputtype=textquery` +
      `&locationbias=point:${PROBE.lat},${PROBE.lng}&fields=photos&key=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const d = await res.json() as { status?: string; error_message?: string; candidates?: unknown[] };
    return {
      api: 'Places API (Legacy)',
      ok: d.status === 'OK',
      status: res.status,
      detail: d.status === 'OK' ? undefined : `${d.status ?? '?'} ${d.error_message ?? ''}`.trim(),
    };
  } catch (err) {
    return { api: 'Places API (Legacy)', ok: false, status: 0, detail: String(err).slice(0, 200) };
  }
}

export async function GET(request: NextRequest) {
  if (!authed(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const key = process.env.GOOGLE_PLACES_API_KEY ?? '';
  if (!key) {
    return NextResponse.json({
      ok: false,
      keyPresent: false,
      verdict: 'GOOGLE_PLACES_API_KEY is not set in this environment. Venue photos fall back to the free sources only (~89% coverage).',
    });
  }

  const [neu, legacy] = await Promise.all([checkNew(key), checkLegacy(key)]);

  const verdict = neu.ok
    ? 'Working — Places API (New) is returning photos. Venue photo coverage is at full strength.'
    : legacy.ok
      ? 'Degraded — only the LEGACY Places API works. It still functions, but Google has frozen it. Enable "Places API (New)" on this key.'
      : 'BROKEN — neither Places API answers. Enable "Places API (New)" for this project, attach billing, and make sure the key\'s API restrictions include it. See `detail` below for Google\'s own words.';

  return NextResponse.json({
    ok: neu.ok || legacy.ok,
    keyPresent: true,
    keyFingerprint: crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), // identify WHICH key, never the key
    checks: [neu, legacy],
    verdict,
  });
}
