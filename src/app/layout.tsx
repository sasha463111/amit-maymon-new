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
    statusBarStyle: 'default',
    title: 'Tehila CRM',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

// Inline script that runs on every page load BEFORE any other JS. It hunts
// down any service worker registered at the root scope (the workbox SW from
// earlier deploys was caching app JS chunks and pinning users to stale code)
// and unregisters it. push-sw.js — our actual push worker — registers at the
// dedicated `/push-sw-scope/` scope so it's left alone.
const SW_CLEANUP_SCRIPT = `
(function() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then(function(regs) {
    var killed = 0;
    regs.forEach(function(r) {
      var scope = r.scope || '';
      // Leave the dedicated push worker alone, kill everything else at root.
      if (scope.indexOf('push-sw-scope') === -1) {
        r.unregister().then(function() { killed++; }).catch(function() {});
      }
    });
    if (killed > 0) {
      // Wipe all caches the dead worker left behind so they don't keep
      // serving stale JS.
      if ('caches' in window) {
        caches.keys().then(function(keys) {
          return Promise.all(keys.map(function(k) { return caches.delete(k); }));
        }).then(function() {
          location.reload();
        }).catch(function() {});
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
