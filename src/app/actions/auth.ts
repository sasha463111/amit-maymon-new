'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { UserRole } from '@/types/database';
import { homeForRole } from '@/lib/roleHome';
import { getSignedInHome } from '@/lib/signedInHome';

export async function loginAction(credentials: { email: string; password?: string; rememberMe?: boolean }) {
  const supabase = await createClient();

  // Personal passwords (Amit, 2026-10-15). Until then the login was email-only
  // with a shared server-side secret — anyone who knew a staff email could get
  // in. The demo site alone keeps the old email-only flow.
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const password = demo ? process.env.EMAIL_ONLY_LOGIN_PASSWORD : credentials.password;
  if (!password) {
    return { error: demo ? 'ההתחברות אינה מוגדרת בשרת.' : 'נא להקליד סיסמה' };
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: credentials.email.trim().toLowerCase(),
    password,
  });

  if (authError) {
    return { error: 'המייל או הסיסמה שגויים. שכחת סיסמה? פנה לעמית.' };
  }
  if (!authData.user) {
    return { error: 'התחברות נכשלה' };
  }

  if (credentials.rememberMe) {
    const { cookies: nextCookies } = await import('next/headers');
    const cookieStore = await nextCookies();
    cookieStore.set('tehila_remember', '1', {
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role, is_active, office_function')
    .eq('id', authData.user.id)
    .single();

  const profile = profileData as { role: string; is_active: boolean; office_function: string | null } | null;

  // Enforce account deactivation at the gate. A CEO disabling a user via
  // settings must actually lock them out — the Supabase session alone isn't
  // enough, so reject + sign out here.
  if (profile && profile.is_active === false) {
    await supabase.auth.signOut();
    return { error: 'החשבון שלך הושבת. פנה למנהל המערכת.' };
  }

  const role = (profile?.role as UserRole) ?? 'SERVICE_ADVISOR';
  redirect(homeForRole(role, profile?.office_function));
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // "?out=1" tells the login page this was a deliberate logout, so it does not
  // try to send the person back into the app.
  redirect('/login?out=1');
}

/** Where an already signed-in user belongs, or null if not signed in. Lets
 *  the login page send a signed-in visitor straight into the app. */
export async function signedInHomeAction(): Promise<string | null> {
  return getSignedInHome();
}
