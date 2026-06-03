'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';

const VIEW_AS_COOKIE = 'tehila_view_as';

async function requireCeo() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר', supabase: null, userId: null };

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = (profileData as { role: string } | null)?.role;
  if (role !== 'CEO') return { error: 'רק מנכ"ל יכול לגשת', supabase: null, userId: null };

  return { error: null, supabase, userId: user.id };
}

export interface SystemUser {
  id: string;
  full_name: string;
  role: UserRole;
  branch_id: string | null;
  branch_name: string | null;
  is_active: boolean;
  is_bodywork_advisor: boolean;
}

export async function listSystemUsers(): Promise<{ data: SystemUser[]; error: string | null }> {
  const { error, supabase } = await requireCeo();
  if (error || !supabase) return { data: [], error: error ?? 'שגיאת אימות' };

  const { data, error: queryError } = await supabase
    .from('profiles')
    .select('id, full_name, role, branch_id, is_active, is_bodywork_advisor, branches(name)')
    .order('full_name');

  if (queryError) return { data: [], error: queryError.message };

  const rows = (data ?? []) as Array<{
    id: string;
    full_name: string;
    role: UserRole;
    branch_id: string | null;
    is_active: boolean;
    is_bodywork_advisor: boolean;
    branches: { name: string } | { name: string }[] | null;
  }>;

  const users: SystemUser[] = rows.map((r) => {
    const branch = Array.isArray(r.branches) ? r.branches[0] : r.branches;
    return {
      id: r.id,
      full_name: r.full_name,
      role: r.role,
      branch_id: r.branch_id,
      branch_name: branch?.name ?? null,
      is_active: r.is_active,
      is_bodywork_advisor: r.is_bodywork_advisor,
    };
  });

  return { data: users, error: null };
}

export async function updateSystemUser(
  userId: string,
  updates: Partial<{ role: UserRole; branch_id: string | null; is_active: boolean; full_name: string }>
) {
  const { error, supabase, userId: callerId } = await requireCeo();
  if (error || !supabase) return { error: error ?? 'שגיאת אימות' };

  // Guardrails on the caller editing themselves: prevent locking yourself out.
  // A CEO can rename themselves but can't demote, disable, or re-branch.
  if (userId === callerId) {
    if (updates.role !== undefined && updates.role !== 'CEO') {
      return { error: 'לא ניתן לשנות את התפקיד של עצמך — שתף משתמש CEO אחר תחילה.' };
    }
    if (updates.is_active === false) {
      return { error: 'לא ניתן להשבית את החשבון שלך.' };
    }
    if (updates.branch_id !== undefined) {
      return { error: 'CEO לא משויך לסניף.' };
    }
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update(updates as never)
    .eq('id', userId);

  if (updateError) return { error: updateError.message };
  revalidatePath('/settings');
  return { ok: true };
}

export interface ViewAsState {
  role: UserRole;
  branchId: string | null;
  userId: string;
  userName: string;
}

/**
 * "Preview as" — sets a cookie that tells the dashboard layout to render
 * navigation as if the CEO were that user. The CEO's own permissions
 * still drive what they can actually DO; this only affects the visible UI.
 */
export async function startViewAsUser(userId: string) {
  const { error, supabase } = await requireCeo();
  if (error || !supabase) return { error: error ?? 'שגיאת אימות' };

  const { data: target } = await supabase
    .from('profiles')
    .select('id, full_name, role, branch_id')
    .eq('id', userId)
    .single();
  const t = target as { id: string; full_name: string; role: UserRole; branch_id: string | null } | null;
  if (!t) return { error: 'משתמש לא נמצא' };

  const cookieStore = await cookies();
  cookieStore.set(
    VIEW_AS_COOKIE,
    JSON.stringify({
      role: t.role,
      branchId: t.branch_id,
      userId: t.id,
      userName: t.full_name,
    }),
    { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 } // 8 hours
  );
  return { ok: true };
}

export async function stopViewAsUser() {
  const cookieStore = await cookies();
  cookieStore.delete(VIEW_AS_COOKIE);
  return { ok: true };
}

export async function getViewAsState(): Promise<ViewAsState | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(VIEW_AS_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ViewAsState;
  } catch {
    return null;
  }
}
