// Base origin for this app's own API.
//
// On the web (and on Vercel) this is EMPTY, so every call stays same-origin and
// relative — behaviour is identical to before. In the bundled native build the
// UI is served from a local Capacitor origin, so it must call the hosted backend
// instead: set NEXT_PUBLIC_API_BASE to the production origin at build time (see
// scripts/build-native.mjs / NATIVE.md) and these calls retarget automatically.
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/+$/, '');

// Prefix an absolute app path (e.g. "/api/feed?…") with the API base when one is
// configured. Leaves already-absolute URLs and the web (empty base) untouched.
export function apiUrl(path: string): string {
  if (!API_BASE) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}
