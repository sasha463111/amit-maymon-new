import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// One address for everyone (2026-10-07).
//
// WHY THIS FILE IS HERE: with the app under src/app, Next.js only runs
// src/middleware.ts. The middleware.ts at the repo root has never executed in
// production (verified: none of its response headers ever appeared, and the
// redirect added there never fired). This file does two things only: the
// legacy-host redirect and keeping the session alive.
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

// Keep people signed in (2026-10-09). The access token lasts an hour and is
// renewed with a single-use refresh token. A Server Component can renew it
// but cannot write cookies, so on a phone that reopened the app after an
// hour the renewed session was thrown away and the old refresh token was
// already spent: the user landed on the login page every time. Middleware
// CAN write cookies, so the session is refreshed here and saved for a year.
const ONE_YEAR = 60 * 60 * 24 * 365;

async function refreshSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true') return response;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          // An empty value is a logout clearing the cookie — respect it.
          response.cookies.set(name, value, value
            ? { ...options, path: '/', sameSite: 'lax', maxAge: ONE_YEAR }
            : { ...options, path: '/' });
        });
      },
    },
  });
  // getUser() is what triggers the refresh when the access token has expired.
  await supabase.auth.getUser();
  return response;
}

export async function middleware(request: NextRequest) {
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '')
    .split(',')[0].trim().toLowerCase();
  const { pathname, search } = request.nextUrl;

  if (isLegacyHost(host) && !pathname.startsWith('/api/') && !pathname.includes('.')) {
    // 307, not permanent: browsers must not cache it in case it has to change.
    return NextResponse.redirect(`https://${OFFICIAL_HOST}${pathname}${search}`, 307);
  }

  // Pages only: API routes (cron, push dispatch) carry no user session, and
  // files need none. A failure here must never block the page itself.
  let res: NextResponse;
  if (!pathname.startsWith('/api/') && !pathname.includes('.')) {
    try {
      res = await refreshSession(request);
    } catch {
      res = NextResponse.next();
    }
  } else {
    res = NextResponse.next();
  }

  // Which build answered and which host it saw — the only way to inspect the
  // legacy deployments, whose Vercel settings and logs we cannot open.
  res.headers.set('x-app-commit', (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7));
  res.headers.set('x-app-host', host || 'none');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
