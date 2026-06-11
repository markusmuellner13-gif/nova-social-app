'use client';

import { useState, useEffect, useCallback } from 'react';
import { LocationState } from '@/types';

type PermissionStatus = 'loading' | 'granted' | 'denied' | 'prompt';

interface UseLocationReturn {
  location: LocationState | null;
  permission: PermissionStatus;
  requestLocation: () => Promise<void>;
  setLocationEnabled: (enabled: boolean) => void;
}

interface GeoResult { city: string; country: string; countryCode: string }

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
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      addr.state ||
      '';
    if (!city) return null;
    return {
      city,
      country: addr.country || 'Unknown',
      countryCode: (addr.country_code ?? '').toUpperCase(),
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
    return {
      city,
      country: data.countryName || 'Unknown',
      countryCode: (data.countryCode ?? '').toUpperCase(),
    };
  } catch { return null; }
}

async function reverseGeocode(lat: number, lng: number): Promise<GeoResult> {
  const nom = await geocodeNominatim(lat, lng);
  if (nom) return nom;
  const bdc = await geocodeBigDataCloud(lat, lng);
  if (bdc) return bdc;
  return { city: 'Unknown City', country: 'Unknown', countryCode: '' };
}

// Never persist a failed geocode — a cached 'Unknown City' would label every
// post wrong until the user clears storage. The server also resolves the city
// from lat/lng as a safety net, but a good cache here avoids the round trip.
function persistLocation(loc: LocationState) {
  if (!loc.city || loc.city === 'Unknown City') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
  localStorage.setItem('nova_last_city', loc.city);
}

const STORAGE_KEY = 'nova_location_v1';

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
          // Re-fetch in background to keep fresh
          if (parsed.enabled) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestLocationSilent() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const geo = await reverseGeocode(lat, lng);
        const loc: LocationState = { lat, lng, ...geo, enabled: true };
        setLocation(loc);
        setPermission('granted');
        persistLocation(loc);
      },
      () => { /* silent fail */ },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  const requestLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setPermission('denied');
      return;
    }
    setPermission('loading');
    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          const geo = await reverseGeocode(lat, lng);
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

  return { location, permission, requestLocation, setLocationEnabled };
}
