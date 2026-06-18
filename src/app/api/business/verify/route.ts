import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Real-business verification (#paid-posts gate).
//
// Confirms the business actually exists by looking it up in Google Places by
// name + city. This is what stops "just anybody who pays" from advertising: only
// a business Google recognises as a real place can be verified — and we pull ITS
// OWN photo/address/coords, so the sponsored post uses the real venue, never an
// arbitrary uploaded image.
//
// Requires GOOGLE_PLACES_API_KEY. Without it, returns verified:false with a
// reason so the portal falls back to manual review instead of auto-publishing.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const key = process.env.GOOGLE_PLACES_API_KEY;

  let body: { business?: string; city?: string } = {};
  try { body = await request.json(); } catch { /* keep empty */ }
  const business = (body.business || '').slice(0, 120).trim();
  const city     = (body.city || '').slice(0, 80).trim();

  if (!business) {
    return NextResponse.json({ verified: false, reason: 'missing_name' }, { status: 400 });
  }
  if (!key) {
    return NextResponse.json({ verified: false, reason: 'verification_unavailable' });
  }

  try {
    const input = encodeURIComponent(`${business} ${city}`.trim());
    const url =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${input}&inputtype=textquery` +
      `&fields=place_id,name,formatted_address,geometry,photos,business_status&key=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return NextResponse.json({ verified: false, reason: 'lookup_failed' });

    const d = await res.json() as {
      candidates?: {
        place_id?: string; name?: string; formatted_address?: string;
        business_status?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
        photos?: { photo_reference?: string }[];
      }[];
    };
    const c = d.candidates?.[0];
    if (!c?.place_id) {
      return NextResponse.json({ verified: false, reason: 'not_found' });
    }

    // Resolve the venue's real photo to a final URL (key stays server-side).
    let photo = '';
    const ref = c.photos?.[0]?.photo_reference;
    if (ref) {
      const photoRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${key}`,
        { redirect: 'manual', signal: AbortSignal.timeout(3000) }
      ).catch(() => null);
      photo = photoRes?.headers.get('location') ?? '';
    }

    return NextResponse.json({
      verified: true,
      placeId: c.place_id,
      name: c.name ?? business,
      address: c.formatted_address ?? city,
      lat: c.geometry?.location?.lat ?? 0,
      lng: c.geometry?.location?.lng ?? 0,
      photo,
    });
  } catch {
    return NextResponse.json({ verified: false, reason: 'error' });
  }
}
