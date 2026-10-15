/** @type {import('next').NextConfig} */
import withPWA from 'next-pwa';

const nextConfig = {
  reactStrictMode: true,
  // One id per build (16/10): the browser compares its own with /api/version
  // and offers a refresh when a newer version is live (UpdateBanner) — an open
  // tab / installed app otherwise keeps running the old code for days.
  env: { NEXT_PUBLIC_BUILD_ID: String(Date.now()) },
  // Security review (16/10): the app doesn't use next/image, yet /_next/image
  // was live — and the image optimizer carries open critical advisories on the
  // 14.x line (RCE with AVIF). Off = no optimizer endpoint at all.
  images: { unoptimized: true },
  // Scanned documents (replacement cars, 2026-10-14) go through server actions;
  // the 1 MB default is too small for a phone photo of a page. Stays under
  // Vercel's 4.5 MB request cap; screens shrink photos before sending anyway.
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
    // The advisor chat (/requests) reads the system docs at runtime (~95KB, traced into every function — the per-route key did not match the route group).
    outputFileTracingIncludes: {
      '/**': ['./docs/reference/modules-and-gotchas.md', './docs/reference/automation-notifications.md'],
    },
  },
};

// next-pwa is fully disabled. push-sw.js (registered explicitly by
// PushSubscriber) is the single service worker for the app. Leaving
// next-pwa active was causing stale workbox sw.js installs to intercept
// fetch requests on returning users.
const pwaConfig = withPWA({
  dest: 'public',
  register: false,
  skipWaiting: true,
  disable: true,
  buildExcludes: [/middleware-manifest\.json$/],
});

export default pwaConfig(nextConfig);
