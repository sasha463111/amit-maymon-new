'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { UserRole } from '@/types/database';

const ROLE_REDIRECT: Record<UserRole, string> = {
  SERVICE_MANAGER: '/cases',
  OFFICE: '/closure',
  CEO: '/approvals',
  PAINTER: '/extras/new',
  SERVICE_ADVISOR: '/cases',
};

export async function loginAction(credentials: { email: string; rememberMe?: boolean }) {
  const supabase = await createClient();

  // Email-only login: staff enter just their email. The actual password is a
  // server-side shared secret (env), never shown or typed by the user. Every
  // active account is set to this secret, so signInWithPassword succeeds by
  // email alone. (No OTP / no email delivery -> no lockout risk.)
  const password = process.env.EMAIL_ONLY_LOGIN_PASSWORD;
  if (!password) {
    return { error: 'ההתחברות אינה מוגדרת בשרת. פנה למנהל המערכת.' };
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: credentials.email.trim().toLowerCase(),
    password,
  });

  if (authError) {
    return { error: 'אימייל לא נמצא במערכת. בדוק את הכתובת או פנה למנהל.' };
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
    .select('role, is_active')
    .eq('id', authData.user.id)
    .single();

  const profile = profileData as { role: string; is_active: boolean } | null;

  // Enforce account deactivation at the gate. A CEO disabling a user via
  // settings must actually lock them out — the Supabase session alone isn't
  // enough, so reject + sign out here.
  if (profile && profile.is_active === false) {
    await supabase.auth.signOut();
    return { error: 'החשבון שלך הושבת. פנה למנהל המערכת.' };
  }

  const role = (profile?.role as UserRole) ?? 'SERVICE_ADVISOR';
  redirect(ROLE_REDIRECT[role]);
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
