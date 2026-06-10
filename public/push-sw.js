// Tehila Bodyshop — push service worker
// Separate from next-pwa's generated sw.js so we don't fight its codegen.
// Registered explicitly by src/components/PushSubscriber.tsx.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'התראה חדשה', body: event.data?.text() ?? '' };
  }

  const title = payload.title || 'תהילה — התראה';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'tehila-notification',
    data: { url: payload.url || '/' },
    dir: 'rtl',
    lang: 'he',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Reuse an existing window if one is open; navigate it to the target.
      for (const client of clientList) {
        if ('focus' in client) {
          const focused = client.focus();
          if ('navigate' in client && typeof client.navigate === 'function') {
            return Promise.resolve(focused)
              .then(() => client.navigate(url))
              .catch(() => self.clients.openWindow && self.clients.openWindow(url));
          }
          return focused;
        }
      }
      // No window open (the iOS-standalone common case): open a fresh one.
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
