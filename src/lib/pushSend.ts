// ─────────────────────────────────────────────────────────────────────────────
// One sender, three transports.
//
// Nova's digest and reminder crons walk a single list of subscribers. Some of
// them are browsers (Web Push / VAPID — unchanged, see webpush.ts), some are
// phones running the bundled app. A phone can't hold a PushSubscription, so it
// registers a device token instead and we deliver through the platform service:
//
//   Android → FCM HTTP v1     (the token @capacitor/push-notifications returns)
//   iOS     → APNs HTTP/2     (a raw APNs device token; no Firebase iOS SDK, so
//                              the native project stays a plain Capacitor app)
//
// EVERY transport is independently gated on its own credentials. With none
// configured this module is inert and the crons behave exactly as they do today
// — nothing breaks before the keys exist, which is the same contract webpush.ts
// already had.
//
// Env (all optional):
//   FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY        — Firebase service account
//   APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID [, APNS_PRODUCTION=1]
// ─────────────────────────────────────────────────────────────────────────────

import { createSign, createPrivateKey } from 'node:crypto';
import http2 from 'node:http2';
import { sendPush as sendWebPush, webPushEnabled, type PushSub } from './webpush';

export interface NativeTarget {
  platform: 'ios' | 'android';
  token: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export type SendResult = { ok: boolean; gone?: boolean };

// PEM keys pasted into a dashboard arrive with the newlines escaped.
function pem(raw: string): string {
  return raw.replace(/\\n/g, '\n').trim();
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── FCM (Android) ────────────────────────────────────────────────────────────

const FCM_PROJECT = process.env.FCM_PROJECT_ID ?? '';
const FCM_EMAIL   = process.env.FCM_CLIENT_EMAIL ?? '';
const FCM_KEY     = process.env.FCM_PRIVATE_KEY ? pem(process.env.FCM_PRIVATE_KEY) : '';

export const fcmEnabled = !!(FCM_PROJECT && FCM_EMAIL && FCM_KEY);

// Google access tokens last an hour. A cron run sends to thousands of devices,
// so mint once and reuse — re-minting per message would add a full OAuth
// round-trip to every single send and blow the function's time budget.
let fcmToken: { value: string; expires: number } | null = null;

async function fcmAccessToken(): Promise<string | null> {
  if (!fcmEnabled) return null;
  const now = Math.floor(Date.now() / 1000);
  if (fcmToken && fcmToken.expires > now + 60) return fcmToken.value;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: FCM_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));

  let assertion: string;
  try {
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    assertion = `${header}.${claims}.${b64url(signer.sign(createPrivateKey(FCM_KEY)))}`;
  } catch {
    return null; // malformed service-account key — stay inert rather than throw
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;
    fcmToken = { value: json.access_token, expires: now + (json.expires_in ?? 3600) };
    return fcmToken.value;
  } catch {
    return null;
  }
}

async function sendFcm(token: string, payload: PushPayload): Promise<SendResult> {
  const access = await fcmAccessToken();
  if (!access) return { ok: false };

  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${FCM_PROJECT}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          // The tap handler reads `url` from data — the same key the web service
          // worker uses, so notification routing is identical on both runtimes.
          data: {
            url: payload.url ?? '/',
            ...(payload.tag ? { tag: payload.tag } : {}),
          },
          android: {
            priority: 'HIGH',
            notification: {
              // Collapse repeats of the same digest instead of stacking them,
              // matching the web notification's `tag` behaviour.
              ...(payload.tag ? { tag: payload.tag } : {}),
              // Android 5+ uses only the ALPHA channel of the small icon and
              // paints it white, so the full-colour launcher icon would render
              // as a solid white square in the status bar. This names the
              // white-silhouette drawable generated by
              // scripts/make-android-notification-icon.mjs.
              icon: 'ic_stat_icon',
              color: '#8b5cf6',
            },
          },
        },
      }),
    });

    if (res.ok) return { ok: true };
    // 404 UNREGISTERED = the app was uninstalled; 400 = a malformed token.
    // Both mean "never send here again", which is what `gone` prunes.
    if (res.status === 404) return { ok: false, gone: true };
    if (res.status === 400) {
      const text = await res.text().catch(() => '');
      return { ok: false, gone: /INVALID_ARGUMENT|not-registered/i.test(text) };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

// ── APNs (iOS) ───────────────────────────────────────────────────────────────

const APNS_KEY_ID = process.env.APNS_KEY_ID ?? '';
const APNS_TEAM   = process.env.APNS_TEAM_ID ?? '';
const APNS_KEY    = process.env.APNS_PRIVATE_KEY ? pem(process.env.APNS_PRIVATE_KEY) : '';
const APNS_TOPIC  = process.env.APNS_BUNDLE_ID ?? 'com.nova.discover';
const APNS_HOST   = process.env.APNS_PRODUCTION === '1'
  ? 'https://api.push.apple.com'
  : 'https://api.sandbox.push.apple.com';

export const apnsEnabled = !!(APNS_KEY_ID && APNS_TEAM && APNS_KEY);

// Apple rejects provider tokens older than 1h and throttles refreshes more
// frequent than every 20 minutes, so cache well inside both bounds.
let apnsJwt: { value: string; issued: number } | null = null;

function apnsAuthToken(): string | null {
  if (!apnsEnabled) return null;
  const now = Math.floor(Date.now() / 1000);
  if (apnsJwt && now - apnsJwt.issued < 30 * 60) return apnsJwt.value;

  try {
    const header = b64url(JSON.stringify({ alg: 'ES256', kid: APNS_KEY_ID }));
    const claims = b64url(JSON.stringify({ iss: APNS_TEAM, iat: now }));
    const signer = createSign('SHA256');
    signer.update(`${header}.${claims}`);
    // APNs wants the raw 64-byte (r||s) signature, not the DER wrapper Node
    // emits by default — `dsaEncoding` asks for exactly that.
    const sig = signer.sign({ key: createPrivateKey(APNS_KEY), dsaEncoding: 'ieee-p1363' });
    apnsJwt = { value: `${header}.${claims}.${b64url(sig)}`, issued: now };
    return apnsJwt.value;
  } catch {
    return null; // malformed .p8 — stay inert
  }
}

// APNs is HTTP/2 only, and `fetch` (undici) speaks HTTP/1.1, so this one
// transport has to use node:http2 directly.
function sendApns(token: string, payload: PushPayload): Promise<SendResult> {
  const auth = apnsAuthToken();
  if (!auth) return Promise.resolve({ ok: false });

  return new Promise<SendResult>(resolve => {
    let settled = false;
    let client: http2.ClientHttp2Session | null = null;
    const finish = (r: SendResult) => {
      if (settled) return;
      settled = true;
      try { client?.close(); } catch { /* already closing */ }
      resolve(r);
    };

    try {
      client = http2.connect(APNS_HOST);
    } catch {
      finish({ ok: false });
      return;
    }
    client.on('error', () => finish({ ok: false }));

    const body = JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: 'default',
        ...(payload.tag ? { 'thread-id': payload.tag } : {}),
      },
      url: payload.url ?? '/',
    });

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${auth}`,
      'apns-topic': APNS_TOPIC,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      ...(payload.tag ? { 'apns-collapse-id': payload.tag.slice(0, 64) } : {}),
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    });

    let status = 0;
    let text = '';
    req.on('response', headers => { status = Number(headers[':status']) || 0; });
    req.on('data', (chunk: Buffer) => { text += chunk.toString(); });
    req.on('error', () => finish({ ok: false }));
    req.on('end', () => {
      if (status === 200) { finish({ ok: true }); return; }
      // 410 = the token is dead. 400 BadDeviceToken = it was never valid for
      // this environment (usually a sandbox token sent to production). Prune both.
      const gone = status === 410 || (status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/i.test(text));
      finish({ ok: false, gone });
    });

    req.setTimeout(10_000, () => finish({ ok: false }));
    req.end(body);
  });
}

// ── The one entry point the crons call ───────────────────────────────────────

export function nativePushEnabled(platform: 'ios' | 'android'): boolean {
  return platform === 'android' ? fcmEnabled : apnsEnabled;
}

/** Is any transport at all configured? Used to decide whether a cron has work. */
export const anyPushEnabled = webPushEnabled || fcmEnabled || apnsEnabled;

export async function sendToNative(target: NativeTarget, payload: PushPayload): Promise<SendResult> {
  if (!target?.token) return { ok: false };
  return target.platform === 'android'
    ? sendFcm(target.token, payload)
    : sendApns(target.token, payload);
}

/**
 * Deliver one notification to whichever kind of subscriber this envelope holds.
 * `gone` is true for permanently dead destinations so the caller prunes them —
 * the same contract sendPush() already had, so cron code barely changes.
 */
export async function sendToSubscriber(
  target: { subscription?: PushSub | null; native?: NativeTarget | null },
  payload: PushPayload,
): Promise<SendResult> {
  if (target.native) return sendToNative(target.native, payload);
  if (target.subscription) return sendWebPush(target.subscription, payload);
  return { ok: false };
}
