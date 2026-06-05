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

async function reverseGeocode(lat: number, lng: number): Promise<{ city: string; country: string; countryCode: string }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      {
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'Nova-App/2.0',
        },
      }
    );
    if (!res.ok) throw new Error('geocode failed');
    const data = await res.json();
    const addr = data.address ?? {};
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      addr.state ||
      'Unknown City';
    const country = addr.country || 'Unknown';
    const countryCode = (addr.country_code ?? '').toUpperCase();
    return { city, country, countryCode };
  } catch {
    return { city: 'Unknown City', country: 'Unknown', countryCode: '' };
  }
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
        setLocation(parsed);
        setPermission('granted');
        // Re-fetch in background to keep fresh
        if (parsed.enabled) {
          void requestLocationSilent();
        }
        return;
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
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
          localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    if (!enabled) setPermission('denied');
  }, []);

  return { location, permission, requestLocation, setLocationEnabled };
}
