import type { Metadata } from 'next';
import './globals.css';
import { Public_Sans } from 'next/font/google';

const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-public-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Tehila Bodyshop CRM',
  description: 'Bodyshop repair workflow management',
  manifest: '/manifest.json',
  themeColor: '#3b82f6',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Tehila CRM',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

// Inline cleanup runs on every page load BEFORE any other JS. Purpose: wipe
// the old workbox sw.js (and its precache of stale JS chunks) that earlier
// deploys installed on users' devices. Critical: identify our push worker by
// its **script URL** ending in /push-sw.js — NOT by scope — because
// push-sw.js registers at scope '/' (the only scope iOS Safari reliably
// fires push events for) and would otherwise be unregistered alongside the
// workbox worker. That bug killed every push subscription on every load.
const SW_CLEANUP_SCRIPT = `
(function() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then(function(regs) {
    var killedAny = false;
    regs.forEach(function(r) {
      var url = (r.active && r.active.scriptURL) || (r.installing && r.installing.scriptURL) || (r.waiting && r.waiting.scriptURL) || '';
      // Whitelist our push worker by script URL.
      var isPushWorker = url.indexOf('/push-sw.js') !== -1;
      if (isPushWorker) return;
      r.unregister().then(function(ok) { if (ok) killedAny = true; }).catch(function() {});
    });
    if (killedAny && 'caches' in window) {
      caches.keys().then(function(keys) {
        return Promise.all(keys.map(function(k) {
          // Don't wipe the push worker's own cache (if it has one).
          if (k.indexOf('push-sw') !== -1) return Promise.resolve();
          return caches.delete(k);
        }));
      }).catch(function() {});
      // Reload once so the page picks up the fresh bundle without the dead
      // workbox SW intercepting in the background.
      if (!sessionStorage.getItem('__sw_kill_reload__')) {
        sessionStorage.setItem('__sw_kill_reload__', '1');
        location.reload();
      }
    }
  }).catch(function() {});
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={publicSans.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SW_CLEANUP_SCRIPT }} />
      </head>
      <body className={`antialiased ${publicSans.className}`}>{children}</body>
    </html>
  );
}
