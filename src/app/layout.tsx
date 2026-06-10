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
// ONLY the old workbox sw.js that earlier deploys installed. It is now
// SURGICAL — it unregisters exactly the worker whose scriptURL ends in
// '/sw.js' and never anything else. Critically it must NEVER touch
// '/push-sw.js' (our push worker): if that gets unregistered, the device
// keeps a push subscription whose endpoint APNs/FCM still accept (201) but
// no service worker is left to display the notification — a silent failure
// that's exactly what we hit. Note '/push-sw.js'.endsWith('/sw.js') is false,
// so the exact-suffix check below leaves the push worker alone.
const SW_CLEANUP_SCRIPT = `
(function() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then(function(regs) {
    var killedAny = false;
    regs.forEach(function(r) {
      var w = r.active || r.waiting || r.installing;
      var url = w && w.scriptURL ? w.scriptURL : '';
      // Only the legacy workbox worker, by exact scriptURL suffix. Anything
      // else (incl. /push-sw.js) is left untouched.
      var isLegacyWorkbox = /\\/sw\\.js(\\?|$)/.test(url) && url.indexOf('/push-sw.js') === -1;
      if (!isLegacyWorkbox) return;
      r.unregister().then(function(ok) { if (ok) killedAny = true; }).catch(function() {});
    });
    if (killedAny && 'caches' in window) {
      caches.keys().then(function(keys) {
        return Promise.all(keys.map(function(k) {
          if (k.indexOf('push-sw') !== -1) return Promise.resolve();
          return caches.delete(k);
        }));
      }).catch(function() {});
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
