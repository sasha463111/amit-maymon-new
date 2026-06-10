import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

const APP_PATHS = ['/cases', '/closure', '/approvals', '/extras', '/notifications', '/painters', '/settings'];

function isAppPath(pathname: string) {
  return APP_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true';

// Keep the session alive for a year so a home-screen PWA stays logged in
// across app restarts. Supabase rotates the refresh token on each refresh;
// what matters is that the cookie itself doesn't expire when the app closes.
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  if (isPreview) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          // CRITICAL: preserve the cookie options Supabase returns AND force a
          // long maxAge on the auth cookies. Dropping options (as the old code
          // did) turned refreshed auth cookies into session cookies that died
          // when the PWA fully closed — the cause of "logged out every time".
          cookiesToSet.forEach(({ name, value, options }) => {
            // Only extend lifetime for real session writes. On logout Supabase
            // sets an empty value to clear the cookie — respect that so logout
            // still works instead of pinning an empty cookie for a year.
            const isClearing = !value;
            const opts: Record<string, unknown> = isClearing
              ? { ...options, path: '/' }
              : { ...options, path: '/', sameSite: 'lax', maxAge: ONE_YEAR };
            request.cookies.set(name, value);
            response.cookies.set(name, value, opts);
          });
        },
      },
    }
  );

  // getUser() triggers a token refresh when the access token is stale; the
  // refreshed cookies are written back via setAll above with a long maxAge.
  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  if (!isPreview && (pathname === '/' || pathname === '')) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (isAppPath(pathname) && !user) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
