// ─────────────────────────────────────────────────────────────────────────────
// Web push sender (VAPID).
//
// Wraps the `web-push` library. FULLY GATED: enabled only when both the public
// and private VAPID keys are set. Until then `webPushEnabled` is false and the
// digest cron no-ops, so nothing breaks before keys are configured.
//
// Setup:
//   npx web-push generate-vapid-keys   → public + private key
//   Vercel env: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
//               VAPID_SUBJECT (e.g. mailto:contact@nova-app.com)
// ─────────────────────────────────────────────────────────────────────────────

import webpush from 'web-push';

const PUBLIC  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const PRIVATE = process.env.VAPID_PRIVATE_KEY ?? '';
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:contact@nova-app.com';

export const webPushEnabled = !!(PUBLIC && PRIVATE);

let configured = false;
function ensureConfigured() {
  if (configured || !webPushEnabled) return;
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
  configured = true;
}

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// Send one push. `gone` is true for dead subscriptions (404/410) so the caller
// can prune them from the store.
export async function sendPush(sub: PushSub, payload: object): Promise<{ ok: boolean; gone?: boolean }> {
  if (!webPushEnabled) return { ok: false };
  ensureConfigured();
  try {
    await webpush.sendNotification(sub as webpush.PushSubscription, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    return { ok: false, gone: status === 404 || status === 410 };
  }
}
