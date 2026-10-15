'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { passwordProblems } from '@/lib/passwordPolicy';

// "החלפת סיסמה" (Amit, 2026-10-15): every signed-in person can choose their
// own password, by the simple rules in src/lib/passwordPolicy.ts. The current
// password is checked first (a throw-away sign-in, signed out right away),
// then the new one is set with the service client — the person's open
// sessions stay signed in. A forgotten password is still reset only by the
// CEO (resetUserPassword).

export async function changeMyPassword(current: string, next: string): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'לא מחובר' };
  const problems = passwordProblems(next ?? '');
  if (problems.length) return { error: `הסיסמה החדשה צריכה: ${problems.join(', ')}` };
  if (next === current) return { error: 'הסיסמה החדשה זהה לנוכחית' };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return { error: 'שרת לא מוגדר' };

  const check = createSupabase(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: wrong } = await check.auth.signInWithPassword({ email: user.email, password: current ?? '' });
  if (wrong) return { error: 'הסיסמה הנוכחית שגויה' };
  await check.auth.signOut({ scope: 'local' }).catch(() => {});

  const admin = createSupabase(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.auth.admin.updateUserById(user.id, { password: next });
  if (error) return { error: `לא נשמר: ${error.message}` };
  return { ok: true };
}
