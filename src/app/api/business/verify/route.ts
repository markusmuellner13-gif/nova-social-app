import { NextRequest, NextResponse } from 'next/server';
import { lookupPlace } from '@/lib/sources/venuePhoto';

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
    // Was the LEGACY findplacefromtext endpoint, which Google made unavailable
    // to Cloud projects created after March 2025 — so verification was failing
    // for the same reason venue photos were. `lookupPlace` speaks the current
    // API and resolves the photo server-side, so the key never reaches a client.
    const place = await lookupPlace(`${business} ${city}`.trim());
    if (!place) {
      return NextResponse.json({ verified: false, reason: 'not_found' });
    }

    return NextResponse.json({
      verified: true,
      placeId: place.placeId,
      name: place.name ?? business,
      address: place.address ?? city,
      lat: place.lat,
      lng: place.lng,
      photo: place.photo,
    });
  } catch {
    return NextResponse.json({ verified: false, reason: 'error' });
  }
}
