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

export async function loginAction(credentials: { email: string; password: string; rememberMe?: boolean }) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  if (authError) {
    return { error: authError.message };
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
    .select('role')
    .eq('id', authData.user.id)
    .single();

  const profile = profileData as { role: string } | null;
  const role = (profile?.role as UserRole) ?? 'SERVICE_ADVISOR';
  redirect(ROLE_REDIRECT[role]);
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
