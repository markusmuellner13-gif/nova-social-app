'use client';

import { useState, useEffect, useCallback } from 'react';
import { LocationState } from '@/types';

type PermissionStatus = 'loading' | 'granted' | 'denied' | 'prompt';

interface UseLocationReturn {
  location: LocationState | null;
  permission: PermissionStatus;
  requestLocation: () => Promise<void>;
  setLocationEnabled: (enabled: boolean) => void;
  setManualLocation: (loc: LocationState) => void;
}

interface GeoResult { city: string; country: string; countryCode: string; district?: string; localKm?: number }

// How far counts as "local". A metropolis (resolved as a proper city) spans more
// ground, so its local ring is wider; a town/village uses a tighter, district-
// sized ring that still pulls in its neighbouring villages but stops short of a
// separate big city next door. Worldwide-safe — driven by the admin level the
// geocoder resolved, not a hard-coded place list.
const METRO_LOCAL_KM = 22;
const TOWN_LOCAL_KM  = 16;

async function geocodeNominatim(lat: number, lng: number): Promise<GeoResult | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      {
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'Nova-App/2.0',
        },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address ?? {};
    // A proper city resolves wider local ring; a town/village uses the tight
    // district-sized ring.
    const isMetro = Boolean(addr.city);
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      addr.state ||
      '';
    if (!city) return null;
    // The admin district the place sits in — universal across countries:
    // county (UK/US/IE), Landkreis/Bezirk (DE/AT via state_district/county),
    // arrondissement/département (FR), provincia (IT/ES) all map to these.
    const district =
      addr.county ||
      addr.state_district ||
      addr.city_district ||
      addr.district ||
      addr.region ||
      '';
    return {
      city,
      country: addr.country || 'Unknown',
      countryCode: (addr.country_code ?? '').toUpperCase(),
      district: district && district !== city ? district : undefined,
      localKm: isMetro ? METRO_LOCAL_KM : TOWN_LOCAL_KM,
    };
  } catch { return null; }
}

// Free, no key, CORS-enabled — reliable fallback when Nominatim rate-limits
async function geocodeBigDataCloud(lat: number, lng: number): Promise<GeoResult | null> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const city = data.city || data.locality || data.principalSubdivision || '';
    if (!city) return null;
    const isMetro = Boolean(data.city);
    const district =
      data.localityInfo?.administrative?.find(
        (a: { adminLevel?: number; name?: string }) => a.adminLevel === 6
      )?.name ||
      data.principalSubdivision ||
      '';
    return {
      city,
      country: data.countryName || 'Unknown',
      countryCode: (data.countryCode ?? '').toUpperCase(),
      district: district && district !== city ? district : undefined,
      localKm: isMetro ? METRO_LOCAL_KM : TOWN_LOCAL_KM,
    };
  } catch { return null; }
}

async function reverseGeocode(lat: number, lng: number): Promise<GeoResult> {
  const nom = await geocodeNominatim(lat, lng);
  if (nom) return nom;
  const bdc = await geocodeBigDataCloud(lat, lng);
  if (bdc) return bdc;
  // 'Unknown City' is an internal failure sentinel, never a real place — it
  // must not be stored as the user's city (a truthy string makes `hasCity`
  // checks think we know where they are, so the app would show a permanent
  // "No content found near Unknown City" instead of retrying or asking).
  return { city: 'Unknown City', country: 'Unknown', countryCode: '' };
}

// Strip the 'Unknown City' failure sentinel so it never leaks into app state
// as if it were a real, resolved place. Coordinates are kept — the feed still
// sends real lat/lng and lets the server attempt its own (independent) geocode.
function sanitizeGeo(geo: GeoResult): GeoResult {
  return geo.city === 'Unknown City' ? { ...geo, city: '' } : geo;
}

// Never persist a failed geocode — a cached 'Unknown City' would label every
// post wrong until the user clears storage. The server also resolves the city
// from lat/lng as a safety net, but a good cache here avoids the round trip.
function persistLocation(loc: LocationState) {
  if (!loc.city || loc.city === 'Unknown City') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
  localStorage.setItem('nova_last_city', loc.city);
}

// A city the user picked by hand (City Explorer) is sticky: it survives
// reloads and GPS must not silently override it. Re-enabling device location
// via requestLocation() clears the flag.
export function persistManualLocation(loc: LocationState) {
  if (typeof window === 'undefined' || !loc.city) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
  localStorage.setItem(MANUAL_KEY, '1');
  localStorage.setItem('nova_last_city', loc.city);
}

function isManualLocation(): boolean {
  try { return localStorage.getItem(MANUAL_KEY) === '1'; } catch { return false; }
}

const STORAGE_KEY = 'nova_location_v1';
const MANUAL_KEY  = 'nova_location_manual';

export function useLocation(): UseLocationReturn {
  const [location, setLocation] = useState<LocationState | null>(null);
  const [permission, setPermission] = useState<PermissionStatus>('loading');

  // Try to load cached location on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const parsed: LocationState = JSON.parse(cached);
        if (!parsed.city || parsed.city === 'Unknown City') {
          // Self-heal: drop bad caches written by older app versions and
          // fall through to a fresh geocode below
          localStorage.removeItem(STORAGE_KEY);
        } else {
          setLocation(parsed);
          setPermission('granted');
          // Re-fetch in background to keep fresh — but never override a city
          // the user picked by hand
          if (parsed.enabled && !isManualLocation()) {
            void requestLocationSilent();
          }
          return;
        }
      } catch { /* ignore */ }
    }

    // Check browser permission state
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((result) => {
          if (result.state === 'granted') {
            setPermission('granted');
            void requestLocationSilent();
          } else if (result.state === 'denied') {
            setPermission('denied');
          } else {
            setPermission('prompt');
          }
          result.onchange = () => {
            if (result.state === 'denied') setPermission('denied');
          };
        })
        .catch(() => setPermission('prompt'));
    } else {
      setPermission('prompt');
    }
  }, []);

  async function requestLocationSilent() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const geo = sanitizeGeo(await reverseGeocode(lat, lng));
        const loc: LocationState = { lat, lng, ...geo, enabled: true };
        setLocation(loc);
        setPermission('granted');
        persistLocation(loc);
      },
      () => { /* silent fail */ },
      // maximumAge kept short so a reopen in a new city (after travel) always
      // gets an actually-current fix instead of reusing a stale one — the
      // whole point of this call is to correct a possibly-wrong cached city.
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  }

  const requestLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setPermission('denied');
      return;
    }
    // Explicit GPS request — switch back from a hand-picked city
    try { localStorage.removeItem(MANUAL_KEY); } catch { /* ignore */ }
    setPermission('loading');
    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          const geo = sanitizeGeo(await reverseGeocode(lat, lng));
          const loc: LocationState = { lat, lng, ...geo, enabled: true };
          setLocation(loc);
          setPermission('granted');
          persistLocation(loc);
          resolve();
        },
        () => {
          setPermission('denied');
          resolve();
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    });
  }, []);

  const setLocationEnabled = useCallback((enabled: boolean) => {
    setLocation((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, enabled };
      persistLocation(updated);
      return updated;
    });
    if (!enabled) setPermission('denied');
  }, []);

  // A city the user picked by hand (City Explorer). Updating the hook's OWN
  // `location` state is what makes the change stick: AppShell mirrors this state
  // into the global context every time it changes, so the feed reloads for the
  // new city immediately. Marking it manual stops GPS from silently overriding.
  const setManualLocation = useCallback((loc: LocationState) => {
    const next: LocationState = { ...loc, enabled: true };
    persistManualLocation(next);
    setLocation(next);
    setPermission('granted');
  }, []);

  return { location, permission, requestLocation, setLocationEnabled, setManualLocation };
}
