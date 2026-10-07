import { NextResponse, type NextRequest } from 'next/server';

// One address for everyone (2026-10-07).
//
// WHY THIS FILE IS HERE: with the app under src/app, Next.js only runs
// src/middleware.ts. The middleware.ts at the repo root has never executed in
// production (verified: none of its response headers ever appeared, and the
// redirect added there never fired). This file deliberately does ONE thing,
// so nothing untested in the root file is switched on by accident.
//
// The same code deploys to three Vercel projects. The two legacy ones (in
// another account) run with an invalid Supabase service-role key and a
// different VAPID key, so push from them never arrives. Their PAGES redirect
// to the official address. Not redirected: /api/* (the reminders cron and the
// push dispatcher may call those hosts) and file paths (service worker,
// manifest, icons).

const OFFICIAL_HOST = 'amit-maymon-new-psi.vercel.app';

function isLegacyHost(host: string): boolean {
  if (!host || host === OFFICIAL_HOST) return false;
  return (
    host === 'amit-maymon-new.vercel.app' ||
    host.startsWith('amit-maymon-new-iyub') ||
    host.includes('sasha463111')
  );
}

export function middleware(request: NextRequest) {
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '')
    .split(',')[0].trim().toLowerCase();
  const { pathname, search } = request.nextUrl;

  if (isLegacyHost(host) && !pathname.startsWith('/api/') && !pathname.includes('.')) {
    // 307, not permanent: browsers must not cache it in case it has to change.
    return NextResponse.redirect(`https://${OFFICIAL_HOST}${pathname}${search}`, 307);
  }

  const res = NextResponse.next();
  // Which build answered and which host it saw — the only way to inspect the
  // legacy deployments, whose Vercel settings and logs we cannot open.
  res.headers.set('x-app-commit', (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7));
  res.headers.set('x-app-host', host || 'none');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
