// Server-side location resolution: city guard (never label posts "Unknown
// City") and IP-geo fallback from Vercel's edge headers (free, no API call).

const geoCache = new Map<string, { city: string; country: string }>();

export function isBadCity(c: string): boolean {
  return !c || c === 'Unknown City' || c === 'Unknown';
}

export async function resolveCityServer(lat: number, lng: number): Promise<{ city: string; country: string } | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = geoCache.get(key);
  if (cached) return cached;

  // BigDataCloud — free, no key, no rate-limit headaches on shared egress IPs
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (res.ok) {
      const d = await res.json() as { city?: string; locality?: string; principalSubdivision?: string; countryName?: string };
      const city = d.city || d.locality || d.principalSubdivision || '';
      if (city) {
        const out = { city, country: d.countryName || '' };
        geoCache.set(key, out);
        return out;
      }
    }
  } catch { /* try Nominatim */ }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      {
        headers: { 'User-Agent': 'Nova-App/2.0 (contact@nova-app.com)', 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(3500),
      }
    );
    if (res.ok) {
      const d = await res.json() as { address?: Record<string, string> };
      const a = d.address ?? {};
      const city = a.city || a.town || a.village || a.municipality || a.county || a.state || '';
      if (city) {
        const out = { city, country: a.country || '' };
        geoCache.set(key, out);
        return out;
      }
    }
  } catch { /* give up */ }

  return null;
}

// Vercel injects the visitor's IP geolocation into every request — a free
// fallback when the browser sent no coordinates (GPS denied / first load).
export function readIpGeo(headers: Headers): { lat: number; lng: number; city: string; country: string } | null {
  const lat = parseFloat(headers.get('x-vercel-ip-latitude') ?? '');
  const lng = parseFloat(headers.get('x-vercel-ip-longitude') ?? '');
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  let city = '';
  try { city = decodeURIComponent(headers.get('x-vercel-ip-city') ?? ''); } catch { /* keep '' */ }
  return { lat, lng, city, country: headers.get('x-vercel-ip-country') ?? '' };
}

// Resolves the request's location: explicit params → IP geo → Vienna default.
// Guarantees a usable city name in the result.
export interface ResolvedGeo { lat: number; lng: number; city: string; country: string }

export async function resolveRequestGeo(
  headers: Headers,
  latParam: string | null, lngParam: string | null,
  cityParam: string, countryParam: string
): Promise<ResolvedGeo> {
  let lat = latParam !== null ? parseFloat(latParam) : NaN;
  let lng = lngParam !== null ? parseFloat(lngParam) : NaN;
  let city = cityParam;
  let country = countryParam;

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    const ip = readIpGeo(headers);
    if (ip) {
      lat = ip.lat; lng = ip.lng;
      if (isBadCity(city) && ip.city) city = ip.city;
      if (isBadCity(country) && ip.country) country = ip.country;
    } else {
      lat = 48.2082; lng = 16.3738;
      if (isBadCity(city)) { city = 'Vienna'; country = 'Austria'; }
    }
  }
  lat = Math.max(-90,  Math.min(90,  lat));
  lng = Math.max(-180, Math.min(180, lng));

  if (isBadCity(city) || isBadCity(country)) {
    const resolved = await resolveCityServer(lat, lng);
    if (resolved) {
      if (isBadCity(city)) city = resolved.city;
      if (isBadCity(country) && resolved.country) country = resolved.country;
    }
    if (isBadCity(city))    city = 'your area';
    if (isBadCity(country)) country = '';
  }

  return { lat, lng, city, country };
}
