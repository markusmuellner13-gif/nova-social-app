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

interface PushLocation { city?: string; lat?: number; lng?: number; categories?: string[]; userId?: string }

// Subscribe to web push. Returns true if a subscription was created & stored.
// Pass the user's location (and learned top interests) so the daily digest cron
// can send a personalised "events near you" for their actual city. Safe to call
// repeatedly (re-registers location + interests).
export async function subscribeToPush(loc?: PushLocation): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY) return false; // push backend not configured yet
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
