'use client';

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

interface PushLocation { city?: string; lat?: number; lng?: number; categories?: string[] }

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
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub, ...(loc ?? {}) }),
    });
    return true;
  } catch {
    return false;
  }
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
