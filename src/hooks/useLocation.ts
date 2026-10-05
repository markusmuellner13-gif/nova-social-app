'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { LocationState } from '@/types';
import { getPosition, watchPosition, geolocationAvailable, ensureLocationPermission, checkLocationPermission, type GeoWatch } from '@/lib/geolocate';
import { decideLiveUpdate, type LivePoint } from '@/lib/liveLocation';
import { isNative } from '@/lib/native';

type PermissionStatus = 'loading' | 'granted' | 'denied' | 'prompt';

interface UseLocationReturn {
  location: LocationState | null;
  permission: PermissionStatus;
  requestLocation: () => Promise<void>;
  setLocationEnabled: (enabled: boolean) => void;
  setManualLocation: (loc: LocationState) => void;
}

interface GeoResult { city: string; country: string; countryCode: string; district?: string; localKm?: number; area?: string }

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
    // The neighbourhood the fix is actually in — what the live label shows.
    const area =
      addr.suburb ||
      addr.neighbourhood ||
      addr.quarter ||
      addr.city_district ||
      addr.borough ||
      '';
    return {
      city,
      country: addr.country || 'Unknown',
      countryCode: (addr.country_code ?? '').toUpperCase(),
      district: district && district !== city ? district : undefined,
      localKm: isMetro ? METRO_LOCAL_KM : TOWN_LOCAL_KM,
      area: area && area !== city ? area : undefined,
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
    const area = data.city && data.locality && data.locality !== city ? data.locality : '';
    return {
      city,
      country: data.countryName || 'Unknown',
      countryCode: (data.countryCode ?? '').toUpperCase(),
      district: district && district !== city ? district : undefined,
      localKm: isMetro ? METRO_LOCAL_KM : TOWN_LOCAL_KM,
      area: area || undefined,
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
  // Bumped whenever the manual/GPS mode flips, so the live watch re-evaluates.
  const [modeTick, setModeTick] = useState(0);

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

    // On native the OS owns permission state: `navigator.permissions` is either
    // absent or reports the WebView's idea of it rather than CoreLocation's. Ask
    // the plugin instead, and only fetch silently when it says permission is
    // already granted — so launching the app never fires an unprompted dialog.
    if (isNative()) {
      void (async () => {
        const granted = await checkLocationPermission();
        if (granted) { setPermission('granted'); void requestLocationSilent(); }
        else setPermission('prompt');
      })();
      return;
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
  // Mount-only on purpose: this reads the cache and the permission state once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The last position committed to state and the last one reverse-geocoded.
  // The one-shot lookups below record theirs too, so the live watch's first fix
  // doesn't geocode the same spot a second time.
  const committedRef = useRef<LivePoint | null>(null);
  const geocodedRef = useRef<{ at: number; point: LivePoint } | null>(null);
  function noteResolvedFix(fix: LivePoint) {
    committedRef.current = fix;
    geocodedRef.current = { at: Date.now(), point: fix };
  }

  async function requestLocationSilent() {
    if (!geolocationAvailable()) return;
    // maximumAge kept short so a reopen in a new city (after travel) always
    // gets an actually-current fix instead of reusing a stale one — the
    // whole point of this call is to correct a possibly-wrong cached city.
    const fix = await getPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000, prompt: false });
    if (!fix) return; /* silent fail */
    noteResolvedFix(fix);
    const geo = sanitizeGeo(await reverseGeocode(fix.lat, fix.lng));
    const loc: LocationState = { lat: fix.lat, lng: fix.lng, ...geo, enabled: true };
    setLocation(loc);
    setPermission('granted');
    persistLocation(loc);
  }

  const requestLocation = useCallback(async () => {
    if (!geolocationAvailable()) {
      setPermission('denied');
      return;
    }
    // Explicit GPS request — switch back from a hand-picked city
    try { localStorage.removeItem(MANUAL_KEY); } catch { /* ignore */ }
    setModeTick(t => t + 1);
    setPermission('loading');
    // A deliberate user action, so this is the right moment to raise the OS
    // permission dialog on native (a no-op on web, where the browser prompts).
    const fix = (await ensureLocationPermission())
      ? await getPosition({ enableHighAccuracy: false, timeout: 10000 })
      : null;
    if (!fix) {
      setPermission('denied');
      return;
    }
    noteResolvedFix(fix);
    const geo = sanitizeGeo(await reverseGeocode(fix.lat, fix.lng));
    const loc: LocationState = { lat: fix.lat, lng: fix.lng, ...geo, enabled: true };
    setLocation(loc);
    setPermission('granted');
    persistLocation(loc);
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
    const next: LocationState = { ...loc, enabled: true, live: false };
    persistManualLocation(next);
    setLocation(next);
    setPermission('granted');
    setModeTick(t => t + 1);   // a hand-picked city stops the live watch
  }, []);

  // ── Live location ─────────────────────────────────────────────────────────
  // Once the user has granted location (and hasn't hand-picked a city), keep
  // following them while the app is open: every real move updates the
  // position, which re-stamps distances and re-ranks the feed around where they
  // are now, and a bigger move re-resolves the neighbourhood / city — a new
  // city reloads the feed for it. The watch is network-accuracy (Wi-Fi/cell,
  // easy on the battery) and stops whenever the app is in the background.
  const geocodingRef = useRef(false);
  useEffect(() => {
    if (permission !== 'granted' || !geolocationAvailable() || isManualLocation()) return;
    if (location && !location.enabled) return;   // the user switched location off
    let watch: GeoWatch | null = null;

    const onFix = (fix: LivePoint) => {
      const decision = decideLiveUpdate(fix, committedRef.current, geocodedRef.current, Date.now());
      if (!decision.commit) return;
      committedRef.current = fix;
      setLocation(prev => {
        if (!prev || !prev.city) return prev;   // the first resolve below names it
        const next: LocationState = { ...prev, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, live: true };
        persistLocation(next);
        return next;
      });
      if (!decision.regeocode || geocodingRef.current) return;
      geocodingRef.current = true;
      geocodedRef.current = { at: Date.now(), point: fix };
      void reverseGeocode(fix.lat, fix.lng)
        .then(raw => {
          const geo = sanitizeGeo(raw);
          if (!geo.city || isManualLocation()) return;   // keep the last good name
          setLocation(prev => {
            const next: LocationState = {
              ...(prev ?? {}),
              ...geo,
              lat: committedRef.current?.lat ?? fix.lat,
              lng: committedRef.current?.lng ?? fix.lng,
              accuracy: committedRef.current?.accuracy ?? fix.accuracy,
              enabled: true,
              live: true,
            };
            persistLocation(next);
            return next;
          });
        })
        .finally(() => { geocodingRef.current = false; });
    };

    const start = () => {
      if (watch || document.visibilityState !== 'visible') return;
      watch = watchPosition(onFix, undefined, { enableHighAccuracy: false, maximumAge: 15_000, timeout: 30_000 });
    };
    const stop = () => { watch?.clear(); watch = null; };
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  // Re-evaluated when permission or the GPS/manual mode changes — NOT on every
  // position, or each fix would tear the watch down and start a new one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission, modeTick, location?.enabled]);

  return { location, permission, requestLocation, setLocationEnabled, setManualLocation };
}
