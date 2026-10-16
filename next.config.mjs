/** @type {import('next').NextConfig} */

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
  // Security headers (security review 16/10). Vercel only sent HSTS. The CSP
  // is deliberately narrow — no embedding in other sites (clickjacking), no
  // plugins, forms only to us — and doesn't restrict scripts (inline Next
  // scripts would break). Camera + mic for scanning / dictation, own site only.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()' },
        ],
      },
    ];
  },
  // Scanned documents (replacement cars, 2026-10-14) go through server actions;
  // the 1 MB default is too small for a phone photo of a page. Stays under
  // Vercel's 4.5 MB request cap; screens shrink photos before sending anyway.
  experimental: {
    // 30MB (16/10): email attachments from the computer / phone go through a server action.
    serverActions: { bodySizeLimit: '30mb' },
  },
  // The advisor chat (/requests) reads the system docs at runtime (~95KB, traced into every function — the per-route key did not match the route group).
  // Top-level since Next 15 (was experimental.outputFileTracingIncludes).
  outputFileTracingIncludes: {
    '/**': ['./docs/reference/modules-and-gotchas.md', './docs/reference/automation-notifications.md'],
  },
};

// next-pwa was removed with the Next 15 upgrade (16/10): it had been fully
// disabled for a while; push-sw.js (registered by PushSubscriber) is the
// app's only service worker.
export default nextConfig;
