// Kill-switch service worker. Older deploys registered a workbox sw.js at /
// that aggressively precached app JS — that cache is the reason returning
// users were stuck on stale bundles and still seeing PGRST errors after
// every deploy.
//
// This minimal worker:
//   1. Skips waiting / claims clients immediately
//   2. Wipes every cache it can see (workbox put pages, JS chunks, etc. there)
//   3. Unregisters itself
//   4. Reloads any open windows so they pick up the live network bundle
//
// next-pwa is now disabled in next.config.mjs so this file is no longer
// overwritten on build.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {
      // ignore
    }
    try {
      await self.registration.unregister();
    } catch (e) {
      // ignore
    }
    try {
      const windows = await self.clients.matchAll({ type: 'window' });
      for (const win of windows) {
        try { win.navigate(win.url); } catch (e) { /* noop */ }
      }
    } catch (e) {
      // ignore
    }
  })());
});

// No fetch handler — every request goes to the network unmediated.
