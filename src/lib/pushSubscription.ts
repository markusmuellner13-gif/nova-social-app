// Validation for stored Web Push subscriptions (used by /api/push/subscribe).

// Browser push services. A Web Push endpoint is a URL the push cron later
// POSTs to FROM THIS SERVER, so an unchecked endpoint would let anyone make
// Nova's backend call an address of their choosing. Real subscriptions only
// ever point at the browser vendors' push services.
const PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com',               // Chrome, Edge, Opera, Samsung Internet
  'push.services.mozilla.com',        // Firefox
  'push.apple.com',                   // Safari (web.push.apple.com)
  'notify.windows.com',               // legacy Edge / Windows
];

export interface StoredWebSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}

/** Keep only a real, size-bounded Web Push subscription — or nothing. */
export function sanitizeWebSubscription(raw: unknown): StoredWebSubscription | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as { endpoint?: unknown; expirationTime?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof o.endpoint !== 'string' || o.endpoint.length > 1024) return null;
  let url: URL;
  try { url = new URL(o.endpoint); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (!PUSH_HOST_SUFFIXES.some(s => host === s || host.endsWith(`.${s}`))) return null;
  const p256dh = o.keys?.p256dh, auth = o.keys?.auth;
  if (typeof p256dh !== 'string' || p256dh.length < 16 || p256dh.length > 256) return null;
  if (typeof auth !== 'string' || auth.length < 8 || auth.length > 64) return null;
  return {
    endpoint: o.endpoint,
    expirationTime: typeof o.expirationTime === 'number' && Number.isFinite(o.expirationTime) ? o.expirationTime : null,
    keys: { p256dh, auth },
  };
}
