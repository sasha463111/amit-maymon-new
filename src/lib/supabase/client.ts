import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { createMockSupabaseClient } from './mock-client';

const isPreview = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true';

export function createClient() {
  if (isPreview) {
    return createMockSupabaseClient() as unknown as ReturnType<typeof createBrowserClient<Database>>;
  }
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        // Persist the auth cookies the BROWSER writes (on every token refresh
        // while the app is open). Without an explicit maxAge these are SESSION
        // cookies — and iOS deletes session cookies when a standalone PWA is
        // closed, which logged staff out every single time they exited the app.
        // The server (middleware + server actions) already writes 1-year
        // cookies; this makes the client agree instead of clobbering them with
        // a session cookie right before the app gets closed.
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
        sameSite: 'lax',
      },
    }
  );
}
