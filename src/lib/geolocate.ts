'use client';

import { isNative, loadPlugin } from './native';

// ─────────────────────────────────────────────────────────────────────────────
// Geolocation, one API for both runtimes.
//
// `navigator.geolocation` does technically function inside a WebView, but on a
// phone it is the wrong tool: it can't trigger the OS permission dialog with
// the right purpose string, it doesn't get background-accuracy treatment, and
// on iOS it fails silently and unrecoverably if Info.plist is incomplete — the
// user just sees a map that never finds them, with no error to report.
// @capacitor/geolocation goes through the real CoreLocation / FusedLocation
// APIs, which is also what store reviewers exercise.
//
// The web path below is byte-for-byte the behaviour Nova already had, so
// nothing about the browser experience changes.
// ─────────────────────────────────────────────────────────────────────────────

export interface GeoFix {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface GeoOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  /**
   * May this call raise the OS permission dialog? Default true, because most
   * callers ARE a user action ("find me", opening the map). Pass false for
   * background/startup refreshes: a dialog that appears at cold start with no
   * context is both bad UX and something App Review specifically looks for.
   */
  prompt?: boolean;
}

/** A live subscription. `clear()` is safe to call twice and before it resolves. */
export interface GeoWatch {
  clear(): void;
}

export function geolocationAvailable(): boolean {
  if (isNative()) return true;
  return typeof navigator !== 'undefined' && !!navigator.geolocation;
}

/** Do we already hold location permission? Never prompts. */
export async function checkLocationPermission(): Promise<boolean> {
  if (!isNative()) return true; // the browser decides at call time, as before
  const plugin = await loadPlugin(() => import('@capacitor/geolocation'));
  if (!plugin) return true;
  try {
    return (await plugin.Geolocation.checkPermissions()).location === 'granted';
  } catch {
    return false;
  }
}

// On native the OS dialog only appears when we ask for it explicitly. Call this
// from a deliberate user action ("Use my location") so the prompt is attached to
// something the user just did, rather than firing at a random moment at startup.
export async function ensureLocationPermission(): Promise<boolean> {
  if (!isNative()) return true; // the browser prompts on first use, as before
  const plugin = await loadPlugin(() => import('@capacitor/geolocation'));
  if (!plugin) return true;
  try {
    const current = await plugin.Geolocation.checkPermissions();
    if (current.location === 'granted') return true;
    if (current.location === 'denied') return false;
    const asked = await plugin.Geolocation.requestPermissions({ permissions: ['location'] });
    return asked.location === 'granted';
  } catch {
    return false;
  }
}

/** One fix, or null. Never rejects — callers already treat null as "no fix". */
export async function getPosition(opts: GeoOptions = {}): Promise<GeoFix | null> {
  const { enableHighAccuracy = false, timeout = 10_000, maximumAge = 0, prompt = true } = opts;

  if (isNative()) {
    const plugin = await loadPlugin(() => import('@capacitor/geolocation'));
    if (plugin) {
      const allowed = prompt ? await ensureLocationPermission() : await checkLocationPermission();
      if (!allowed) return null;
      try {
        const pos = await plugin.Geolocation.getCurrentPosition({
          enableHighAccuracy, timeout, maximumAge,
        });
        return {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
      } catch {
        return null;
      }
    }
    // Plugin missing → fall through to the WebView's own geolocation rather
    // than failing outright.
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return new Promise<GeoFix | null>(resolve => {
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy, timeout, maximumAge },
    );
  });
}

/**
 * Continuous fixes. Returns a handle synchronously even though the native
 * subscription resolves asynchronously — so a caller that starts navigation and
 * immediately cancels it can't leak a watch that registers after the fact.
 */
export function watchPosition(
  onFix: (fix: GeoFix) => void,
  onError?: () => void,
  opts: GeoOptions = {},
): GeoWatch {
  const { enableHighAccuracy = true, timeout = 12_000, maximumAge = 2000 } = opts;
  let cancelled = false;

  if (isNative()) {
    let nativeId: string | null = null;
    void (async () => {
      const plugin = await loadPlugin(() => import('@capacitor/geolocation'));
      if (!plugin || cancelled) { if (!plugin) onError?.(); return; }
      if (!(await ensureLocationPermission())) { onError?.(); return; }
      try {
        const id = await plugin.Geolocation.watchPosition(
          { enableHighAccuracy, timeout, maximumAge },
          (pos, err) => {
            if (cancelled) return;
            if (err || !pos) { onError?.(); return; }
            onFix({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            });
          },
        );
        // Cancelled while we were awaiting registration — tear it straight down.
        if (cancelled) { void plugin.Geolocation.clearWatch({ id }).catch(() => {}); return; }
        nativeId = id;
      } catch {
        onError?.();
      }
    })();

    return {
      clear() {
        cancelled = true;
        if (nativeId === null) return;
        const id = nativeId;
        nativeId = null;
        void loadPlugin(() => import('@capacitor/geolocation'))
          .then(p => p?.Geolocation.clearWatch({ id }))
          .catch(() => {});
      },
    };
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError?.();
    return { clear() {} };
  }

  const webId = navigator.geolocation.watchPosition(
    p => { if (!cancelled) onFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); },
    () => { if (!cancelled) onError?.(); },
    { enableHighAccuracy, timeout, maximumAge },
  );

  return {
    clear() {
      cancelled = true;
      navigator.geolocation?.clearWatch(webId);
    },
  };
}
