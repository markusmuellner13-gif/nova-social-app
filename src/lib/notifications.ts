'use client';
import { apiUrl } from '@/lib/apiBase';

// ─────────────────────────────────────────────────────────────────────────────
// Notifications & web push (#4)
//
// • initNotifications()  — registers the service worker (idempotent).
// • ensureNotificationPermission() — asks the user once; needed before any
//   reminder can actually fire (previously the app scheduled reminders but never
//   requested permission, so they silently never showed).
// • subscribeToPush() — subscribes to web push IF a VAPID public key is set
//   (NEXT_PUBLIC_VAPID_PUBLIC_KEY) and posts the subscription to the backend.
//   No key → cleanly skips; local reminders still work.
// ─────────────────────────────────────────────────────────────────────────────

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

let swRegistration: ServiceWorkerRegistration | null = null;

// ── Why push isn't working (the missing diagnosis) ───────────────────────────
//
// subscribeToPush() used to return a bare `false` from a catch-all, so every
// failure looked identical and the user was told nothing. That hid the single
// most common cause on iPhone:
//
//   **iOS only delivers Web Push to a site installed on the Home Screen.**
//   In a normal Safari tab there is no push at all — permission can't even be
//   granted. iOS 16.4+ is also required.
//
// So an iPhone user in Safari gets no push ever, silently, and only sees the
// in-app notifications the running page creates — which is exactly the
// "notifications only appear when I open the app" symptom.
export type PushCapability =
  | 'ready'             // push can be used (may still need permission)
  | 'ios-needs-install' // iOS Safari tab — must Add to Home Screen first
  | 'unsupported'       // no service worker / PushManager on this browser
  | 'no-key'            // NEXT_PUBLIC_VAPID_PUBLIC_KEY not configured
  | 'denied';           // user explicitly blocked notifications

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    // iPadOS 13+ reports as a Mac; the touch-point check distinguishes it.
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Is the app running as an installed PWA / from the Home Screen? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia?.('(display-mode: standalone)').matches === true || iosStandalone === true;
}

export function pushCapability(): PushCapability {
  if (typeof window === 'undefined') return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'no-key';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    // On iOS this is what a plain Safari tab looks like — PushManager simply
    // isn't there until the site is installed. Report the actionable reason
    // rather than the generic one.
    return isIOS() && !isStandalone() ? 'ios-needs-install' : 'unsupported';
  }
  if (isIOS() && !isStandalone()) return 'ios-needs-install';
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return 'denied';
  return 'ready';
}

export async function initNotifications(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (swRegistration) return swRegistration;
  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    return swRegistration;
  } catch {
    return null;
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

interface PushLocation {
  city?: string; lat?: number; lng?: number; categories?: string[]; userId?: string;
  // The locale the user picked in Profile → Settings. The server builds the
  // whole notification from it, so it must travel with the subscription — the
  // cron has no session and no other way to know what language to speak.
  locale?: string;
  reminders?: { postId: string; title: string; venue?: string; fireAt: number; minutesBefore: number }[];
}

/**
 * Push the user's reminder list to the server so /api/cron/reminders can deliver
 * them with the app closed.
 *
 * `fireAt` is computed HERE, not on the server: the browser knows the user's
 * actual timezone, whereas the server only ever sees a longitude (which the
 * digest uses to approximate local time — fine for "morning vs evening", not for
 * "this event starts at 20:00").
 *
 * Returns false when push isn't usable, in which case AppContext keeps its
 * in-page timer as the only available fallback.
 */
export async function syncReminders(
  reminders: { postId: string; title: string; venue?: string; eventDateRaw?: string; minutesBefore: number }[],
): Promise<boolean> {
  if (pushCapability() !== 'ready') return false;
  const reg = await initNotifications();
  const sub = await reg?.pushManager?.getSubscription();
  if (!sub) return false; // not subscribed yet; the next subscribeToPush carries them

  const payload = reminders.flatMap(r => {
    if (!r.eventDateRaw) return [];
    // Event time-of-day is unknown, so anchor at noon local — the same
    // assumption the old in-page scheduler made, kept so behaviour doesn't shift.
    const eventMs = new Date(`${r.eventDateRaw}T12:00:00`).getTime();
    if (!Number.isFinite(eventMs)) return [];
    return [{
      postId: r.postId,
      title: r.title,
      venue: r.venue,
      fireAt: eventMs - r.minutesBefore * 60_000,
      minutesBefore: r.minutesBefore,
    }];
  });

  try {
    await fetch(apiUrl('/api/push/subscribe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub, reminders: payload }),
    });
    return true;
  } catch {
    return false;
  }
}

// Subscribe to web push. Returns true if a subscription was created & stored.
// Pass the user's location (and learned top interests) so the daily digest cron
// can send a personalised "events near you" for their actual city. Safe to call
// repeatedly (re-registers location + interests).
export async function subscribeToPush(loc?: PushLocation): Promise<boolean> {
  // Bail with a logged reason rather than a silent false — a push subscription
  // that never happens is invisible otherwise, and on iOS-in-Safari it never can.
  const cap = pushCapability();
  if (cap !== 'ready') {
    console.info('[push] not subscribing —', cap);
    return false;
  }
  const reg = await initNotifications();
  if (!reg || !('pushManager' in reg)) return false;
  const granted = await ensureNotificationPermission();
  if (!granted) return false;

  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await fetch(apiUrl('/api/push/subscribe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub, ...(loc ?? {}) }),
    });
    return true;
  } catch {
    return false;
  }
}

// ── App-icon badge (the number on the app icon, like every other app) ─────────
// Uses the Badging API (navigator.setAppBadge / clearAppBadge). It only renders
// on platforms where the badge surface exists — an installed PWA or the native
// Capacitor shell on supporting OSes — and is a clean no-op everywhere else
// (e.g. a normal browser tab), so it's always safe to call.
export function setAppBadge(count: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0 && typeof nav.setAppBadge === 'function') {
      void nav.setAppBadge(count).catch(() => {});
    } else if (typeof nav.clearAppBadge === 'function') {
      void nav.clearAppBadge().catch(() => {});
    }
  } catch { /* Badging API unavailable */ }
}

export function clearAppBadge(): void {
  setAppBadge(0);
}

// Close every currently-displayed OS notification banner. The service worker
// only closes a notification when the user taps it (notificationclick) — if
// they instead just open/foreground the app another way, the banner is left
// sitting in the tray/lock-screen forever. Call this whenever the app comes
// to the foreground so opening it any way always clears stale banners.
export async function dismissActiveNotifications(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = swRegistration ?? await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    const shown = await reg.getNotifications();
    shown.forEach(n => n.close());
  } catch { /* unsupported or SW not ready */ }
}

// Show a notification immediately via the SW (preferred) or the page API.
export async function showLocalNotification(title: string, body: string, url = '/'): Promise<void> {
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  const reg = await initNotifications();
  const options: NotificationOptions = {
    body,
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    data: { url },
  };
  try {
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch { /* permission revoked mid-session */ }
}
