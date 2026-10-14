/** @type {import('next').NextConfig} */
import withPWA from 'next-pwa';

const nextConfig = {
  reactStrictMode: true,
  // Scanned documents (replacement cars, 2026-10-14) go through server actions;
  // the 1 MB default is too small for a phone photo of a page. Stays under
  // Vercel's 4.5 MB request cap; screens shrink photos before sending anyway.
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
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
