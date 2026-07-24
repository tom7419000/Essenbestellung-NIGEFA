/* Service Worker für Web-Push-Benachrichtigungen des Essensbestellungs-Portals. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Essensbestellung', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Essensbestellung';
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    data: data.data || {},
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    renotify: Boolean(data.tag),
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Bereits offenes Fenster fokussieren und zur Zielseite navigieren.
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl).catch(() => {});
          return undefined;
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
