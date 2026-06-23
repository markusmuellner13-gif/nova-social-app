import { NextRequest, NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/serverCache';

// ─────────────────────────────────────────────────────────────────────────────
// City autocomplete proxy.
//
// WHY: the city search used to call Nominatim DIRECTLY from every browser. The
// public Nominatim service forbids heavy/bulk client use and rate-limits by IP —
// at any real scale users would get 429s and a broken search box. We proxy it
// server-side instead: one shared egress, a proper identifying User-Agent, and a
// Redis cache so popular queries (rome, milan, …) are served instantly and we
// stay polite to OSM. Rate limiting is enforced by middleware (read tier).
//
// GET /api/geocode?q=rom → { results: [{ city, country, countryCode, lat, lng }] }
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string; town?: string; village?: string; municipality?: string;
    county?: string; state?: string; country?: string; country_code?: string;
    state_district?: string; city_district?: string; region?: string;
  };
}

export interface GeocodeCity {
  city: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  label: string;
  district?: string;
  localKm?: number;
}

// A proper city spans a wider "local" ring than a town/village (whose tighter,
// district-sized ring pulls in neighbouring villages but stops short of the
// separate big city next door). Worldwide-safe — driven by the admin level.
const METRO_LOCAL_KM = 22;
const TOWN_LOCAL_KM  = 16;

export async function GET(request: NextRequest) {
  const raw = (new URL(request.url).searchParams.get('q') || '').trim();
  const q = raw.slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });

  const cacheKey = `nova:geocode:v1:${q.toLowerCase()}`;
  const cached = await cacheGet<GeocodeCity[]>(cacheKey);
  if (cached) {
    return NextResponse.json({ results: cached }, { headers: { 'x-nova-cache': 'HIT' } });
  }

  let data: NominatimResult[] = [];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}` +
      `&format=json&addressdetails=1&limit=8&accept-language=en`,
      {
        headers: {
          // Nominatim requires a genuine, identifying UA per its usage policy.
          'User-Agent': 'Nova-App/2.0 (+https://nova-phi-liart.vercel.app; contact@nova-app.com)',
          'Accept-Language': 'en',
        },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (res.ok) data = await res.json() as NominatimResult[];
  } catch {
    return NextResponse.json({ results: [] }, { status: 200 });
  }

  // Keep populated places, dedupe by city|country.
  const seen = new Set<string>();
  const results: GeocodeCity[] = [];
  for (const r of data) {
    const a = r.address ?? {};
    const city = a.city || a.town || a.village || a.municipality || a.county || a.state
      || r.display_name.split(',')[0]?.trim() || '';
    if (!city) continue;
    const country = a.country ?? '';
    const key = `${city}|${country}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const isMetro = Boolean(a.city);
    const district = a.county || a.state_district || a.city_district || a.region || '';
    results.push({
      city, country,
      countryCode: (a.country_code ?? '').toUpperCase(),
      lat, lng,
      label: r.display_name,
      district: district && district !== city ? district : undefined,
      localKm: isMetro ? METRO_LOCAL_KM : TOWN_LOCAL_KM,
    });
  }

  // Cache 24h — city coordinates don't move. Short cache even on empty to absorb
  // repeated misspellings without re-hitting Nominatim.
  await cacheSet(cacheKey, results, results.length ? 86400 : 600);

  return NextResponse.json(
    { results },
    { headers: { 'x-nova-cache': 'MISS', 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
  );
}
