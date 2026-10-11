'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { UserRole } from '@/types/database';

const VIEW_AS_COOKIE = 'tehila_view_as';
// Real staff accounts; anything else (tehila.test, developer accounts) is a
// test account and is listed separately.
const STAFF_EMAIL_DOMAIN = '@toyota-tehila.co.il';

/** Auth admin calls need the service-role key — the user session can't. Use
 *  only after requireCeo(). */
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

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
  branch_ids: string[]; // Array of branch UUIDs
  branch_names: string[]; // Corresponding branch names for UI display
  is_active: boolean;
  is_bodywork_advisor: boolean;
  /** Login address — Amit (2026-10-11) needs it to manage people. */
  email: string | null;
  last_sign_in_at: string | null;
  /** Has at least one device registered for push. */
  has_push: boolean;
  is_staff: boolean;
}

export async function listSystemUsers(): Promise<{ data: SystemUser[]; error: string | null }> {
  const { error, supabase } = await requireCeo();
  if (error || !supabase) return { data: [], error: error ?? 'שגיאת אימות' };

  const { data, error: queryError } = await supabase
    .from('profiles')
    .select('id, full_name, role, branch_ids, is_active, is_bodywork_advisor')
    .order('full_name');

  if (queryError) return { data: [], error: queryError.message };

  const rows = (data ?? []) as Array<{
    id: string;
    full_name: string;
    role: UserRole;
    branch_ids: string[];
    is_active: boolean;
    is_bodywork_advisor: boolean;
  }>;

  // Fetch all branches for display mapping
  const { data: branchesData } = await supabase.from('branches').select('id, name');
  const branchNameMap = new Map((branchesData ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));

  // Email, last sign-in and push live outside profiles (auth.users,
  // push_subscriptions) — read with the service client, CEO already checked.
  const admin = serviceClient();
  const [usersPage, pushRows] = admin
    ? await Promise.all([
        admin.auth.admin.listUsers({ perPage: 1000 }).then((r) => r.data?.users ?? []),
        admin.from('push_subscriptions').select('user_id').then((r) => (r.data ?? []) as { user_id: string }[]),
      ])
    : [[], []];
  const authById = new Map(usersPage.map((u) => [u.id, u]));
  const pushSet = new Set(pushRows.map((r) => r.user_id));

  const users: SystemUser[] = rows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    role: r.role,
    branch_ids: r.branch_ids ?? [],
    branch_names: (r.branch_ids ?? []).map((bid) => branchNameMap.get(bid) ?? bid),
    is_active: r.is_active,
    is_bodywork_advisor: r.is_bodywork_advisor,
    email: authById.get(r.id)?.email ?? null,
    last_sign_in_at: authById.get(r.id)?.last_sign_in_at ?? null,
    has_push: pushSet.has(r.id),
    is_staff: (authById.get(r.id)?.email ?? '').toLowerCase().endsWith(STAFF_EMAIL_DOMAIN),
  }));
  // Real staff first, test accounts last.
  users.sort((a, b) => Number(b.is_staff) - Number(a.is_staff));

  return { data: users, error: null };
}

export async function updateSystemUser(
  userId: string,
  updates: Partial<{ role: UserRole; branch_ids: string[]; is_active: boolean; full_name: string }>
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
    if (updates.branch_ids !== undefined) {
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
  branchIds: string[];
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
    .select('id, full_name, role, branch_ids')
    .eq('id', userId)
    .single();
  const t = target as { id: string; full_name: string; role: UserRole; branch_ids: string[] | null } | null;
  if (!t) return { error: 'משתמש לא נמצא' };

  const cookieStore = await cookies();
  cookieStore.set(
    VIEW_AS_COOKIE,
    JSON.stringify({
      role: t.role,
      branchIds: t.branch_ids ?? [],
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

/**
 * Create a new system user (CEO only).
 * Creates both Auth user and profiles record atomically.
 */
export async function createNewSystemUser(params: {
  email: string;
  full_name: string;
  role: UserRole;
  branch_ids: string[];
}) {
  const { error, supabase, userId: callerId } = await requireCeo();
  if (error || !supabase) return { error: error ?? 'שגיאת אימות' };

  const { full_name, role, branch_ids } = params;
  const email = params.email.trim().toLowerCase();

  // Validate inputs
  if (!email || !email.includes('@')) return { error: 'דוא"ל לא תקין' };
  // Sign-in is by email only: every account uses the shared secret the login
  // page signs in with. A password typed here would lock the person out.
  const password = process.env.EMAIL_ONLY_LOGIN_PASSWORD;
  if (!password) return { error: 'EMAIL_ONLY_LOGIN_PASSWORD לא מוגדר בשרת' };
  const admin = serviceClient();
  if (!admin) return { error: 'שרת לא מוגדר (service key)' };
  if (!full_name || full_name.trim().length === 0) return { error: 'שם מלא נדרש' };
  if (!role) return { error: 'תפקיד נדרש' };

  // CEO cannot have branches
  if (role === 'CEO' && branch_ids.length > 0) {
    return { error: 'מנכ"ל לא יכול להיות משויך לסניף' };
  }

  // Non-CEO must have at least one branch
  if (role !== 'CEO' && branch_ids.length === 0) {
    return { error: 'משתמש ללא CEO חייב להיות משויך לסניף אחד לפחות' };
  }

  // Try to create auth user via admin API
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Auto-confirm email
  });

  if (authError) {
    // Check if it's a duplicate email
    if (authError.message.includes('already registered')) {
      return { error: 'דוא"ל זה כבר רשום במערכת' };
    }
    return { error: `שגיאה ביצירת משתמש: ${authError.message}` };
  }

  if (!authUser.user?.id) {
    return { error: 'שגיאה ביצירת משתמש - לא קיבלנו ID' };
  }

  // The on_auth_user_created trigger has already made a bare profile — fill
  // it in (upsert), don't insert a second one.
  const { error: profileError } = await admin
    .from('profiles')
    .upsert(
      {
        id: authUser.user.id,
        full_name,
        role,
        branch_ids,
        is_active: true,
        is_bodywork_advisor: false,
      } as any
    );

  if (profileError) {
    // If profile creation fails, try to delete the auth user we just created
    await admin.auth.admin.deleteUser(authUser.user.id).catch(() => {
      // Ignore delete errors
    });
    return { error: `שגיאה ביצירת פרופיל: ${profileError.message}` };
  }

  revalidatePath('/settings');
  return { ok: true, userId: authUser.user.id, email };
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
