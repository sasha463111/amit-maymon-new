import { createClient } from '@/lib/supabase/server';
import { homeForRole } from '@/lib/roleHome';

/**
 * Where a user who is ALREADY signed in should land, or null when nobody is
 * signed in (or the account is deactivated).
 *
 * Why this exists (2026-10-09): the installed app opens at "/", which always
 * redirected to the login page without asking whether the session was still
 * valid. People were shown the email form every time they opened the app and
 * typed their email again (one new session per open, 6 in 3 days for Amit)
 * even though they were still signed in. The rule mirrors the dashboard
 * layout, so the two can never send a user back and forth: a deactivated
 * account is not "signed in"; a missing profile is treated like the layout
 * treats it (default role).
 */
export async function getSignedInHome(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
    const profile = data as { role: string; is_active: boolean | null } | null;
    if (profile && profile.is_active === false) return null;
    return homeForRole(profile?.role);
  } catch {
    return null;
  }
}
