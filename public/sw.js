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
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
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
