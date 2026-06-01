/** @type {import('next').NextConfig} */
import withPWA from 'next-pwa';

const nextConfig = {
  reactStrictMode: true,
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
