import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';
import { createMockSupabaseClient } from './mock-client';

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true';

export async function createClient() {
  if (isPreview) {
    return createMockSupabaseClient() as unknown as ReturnType<typeof createServerClient<Database>>;
  }

  const cookieStore = await cookies();

  // Always persist the session for a year so the home-screen PWA stays logged
  // in across app restarts. We no longer gate this on a "remember me" checkbox —
  // staff should never have to re-login just because they closed the app.
  const ONE_YEAR = 60 * 60 * 24 * 365;

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // Respect cookie clearing on logout (empty value); only extend
              // lifetime for real session writes.
              const finalOptions = value
                ? { ...options, path: '/', sameSite: 'lax' as const, maxAge: ONE_YEAR }
                : { ...options, path: '/' };
              cookieStore.set(name, value, finalOptions);
            });
          } catch {
            // Called from a Server Component render pass (read-only cookies);
            // the middleware handles the actual cookie write on that request.
          }
        },
      },
    }
  );
}
