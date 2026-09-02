'use client';

import { isNative, nativePlatform, loadPlugin } from './native';

// ─────────────────────────────────────────────────────────────────────────────
// Push inside the bundled app.
//
// WHY THIS FILE HAS TO EXIST: Nova's push has always been Web Push — a service
// worker plus a VAPID subscription. Neither exists in a Capacitor WebView:
//
//   • iOS (WKWebView, capacitor:// scheme) has NO service worker at all, so
//     `pushCapability()` returns 'unsupported' forever and no subscription can
//     ever be created.
//   • Android's WebView can register a worker but has no browser push service
//     behind PushManager, so `subscribe()` fails.
//
// Shipping the native app without this would mean shipping an app whose only
// retention loop — the daily "events near you" digest — is silently dead.
//
// So natively we register with the OS instead and hand the server a device
// token: an FCM token on Android, a raw APNs token on iOS. The server sends to
// each via its own transport (src/lib/pushSend.ts). Web Push is untouched and
// remains exactly what browsers use.
// ─────────────────────────────────────────────────────────────────────────────

export interface NativePushToken {
  platform: 'ios' | 'android';
  token: string;
}

let cached: NativePushToken | null = null;
let listenersBound = false;

/** Where a tapped notification wants to send the user, if the app was launched by one. */
let pendingTapUrl: string | null = null;

export function takePendingTapUrl(): string | null {
  const url = pendingTapUrl;
  pendingTapUrl = null;
  return url;
}

/**
 * Ask the OS for notification permission and register for a device token.
 *
 * Resolves null on every failure path (no plugin, permission denied, no APNs/FCM
 * config in the native project yet) so callers can treat it exactly like a failed
 * web-push subscribe. Safe to call repeatedly — the token is cached.
 */
export async function registerNativePush(): Promise<NativePushToken | null> {
  if (!isNative()) return null;
  if (cached) return cached;

  const plugin = await loadPlugin(() => import('@capacitor/push-notifications'));
  if (!plugin) return null;
  const { PushNotifications } = plugin;

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return null;
  } catch {
    return null;
  }

  bindListeners(PushNotifications);

  // `register()` is fire-and-forget; the token arrives on the 'registration'
  // event. Race it against a timeout so a device with no APNs/FCM entitlement
  // configured yet fails in seconds instead of hanging the settings screen.
  return new Promise<NativePushToken | null>(resolve => {
    let settled = false;
    const finish = (v: NativePushToken | null) => { if (!settled) { settled = true; resolve(v); } };

    const timer = setTimeout(() => finish(null), 15_000);

    void PushNotifications.addListener('registration', token => {
      clearTimeout(timer);
      const platform = nativePlatform();
      if (platform !== 'ios' && platform !== 'android') { finish(null); return; }
      cached = { platform, token: token.value };
      finish(cached);
    });

    void PushNotifications.addListener('registrationError', () => {
      clearTimeout(timer);
      finish(null);
    });

    void PushNotifications.register().catch(() => { clearTimeout(timer); finish(null); });
  });
}

type PushPlugin = typeof import('@capacitor/push-notifications')['PushNotifications'];

// Bound once per app run. Two things the OS gives us that the web never did:
// a foreground delivery hook, and the tap that launched the app.
function bindListeners(PushNotifications: PushPlugin) {
  if (listenersBound) return;
  listenersBound = true;

  // iOS suppresses banners while the app is in the foreground unless we opt in
  // (we do, via presentationOptions in capacitor.config.ts). Android delivers
  // the data message to us instead — so mirror it into a local notification,
  // otherwise a foregrounded Android user sees nothing at all.
  void PushNotifications.addListener('pushNotificationReceived', async notification => {
    if (nativePlatform() !== 'android') return;
    const local = await loadPlugin(() => import('@capacitor/local-notifications'));
    if (!local) return;
    try {
      await local.LocalNotifications.schedule({
        notifications: [{
          id: Math.floor(Math.random() * 2_000_000_000),
          title: notification.title ?? 'Nova',
          body: notification.body ?? '',
          extra: notification.data,
        }],
      });
    } catch { /* notification channel unavailable */ }
  });

  // The whole point of a push: tapping it opens the right screen. The payload
  // carries the same `url` the web service worker uses, so routing is shared.
  void PushNotifications.addListener('pushNotificationActionPerformed', action => {
    const data = action.notification?.data as Record<string, unknown> | undefined;
    const url = typeof data?.url === 'string' ? data.url : null;
    pendingTapUrl = url ?? '/';
    window.dispatchEvent(new CustomEvent('nova:push-tap', { detail: { url: pendingTapUrl } }));
  });
}

/** Dismiss every banner still sitting in the OS tray. Native twin of the SW path. */
export async function clearNativeNotifications(): Promise<void> {
  const push = await loadPlugin(() => import('@capacitor/push-notifications'));
  try { await push?.PushNotifications.removeAllDeliveredNotifications(); } catch { /* ignore */ }
  const local = await loadPlugin(() => import('@capacitor/local-notifications'));
  try { await local?.LocalNotifications.removeAllDeliveredNotifications(); } catch { /* ignore */ }
}

/** Show a notification right now (the native twin of showLocalNotification). */
export async function showNativeLocalNotification(title: string, body: string, url = '/'): Promise<boolean> {
  const local = await loadPlugin(() => import('@capacitor/local-notifications'));
  if (!local) return false;
  const { LocalNotifications } = local;
  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') {
      perm = await LocalNotifications.requestPermissions();
    }
    if (perm.display !== 'granted') return false;
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 2_000_000_000),
        title,
        body,
        extra: { url },
      }],
    });
    return true;
  } catch {
    return false;
  }
}
