/* Nova service worker — notifications + web push (#4)
 *
 * Handles two things:
 *  1. Web push messages (when a VAPID key + push backend are configured) so users
 *     get "event near you tonight" alerts even when the app is closed.
 *  2. Notification clicks — focuses an open Nova tab or opens a new one.
 *
 * Local in-session reminders are scheduled from the app via
 * registration.showNotification (see src/lib/notifications.ts).
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || 'Nova';
  const options = {
    body: data.body || 'Something is happening near you 🎉',
    icon: data.icon || '/icon-192.png',
    badge: '/favicon-32.png',
    data: { url: data.url || '/' },
    tag: data.tag || 'nova-event',
  };
  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    // Bump the app-icon badge so users see a count even with the app closed.
    // data.badge may carry the server's known unread count; otherwise show a
    // generic mark. No-op where the Badging API isn't available.
    try {
      if (self.navigator && typeof self.navigator.setAppBadge === 'function') {
        const n = Number(data.badge);
        await (Number.isFinite(n) && n > 0 ? self.navigator.setAppBadge(n) : self.navigator.setAppBadge());
      }
    } catch (e) { /* Badging API unavailable */ }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Opening a notification clears the app-icon badge, like any other app.
  try {
    if (self.navigator && typeof self.navigator.clearAppBadge === 'function') {
      self.navigator.clearAppBadge();
    }
  } catch (e) { /* Badging API unavailable */ }
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) { client.navigate(url); return client.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
