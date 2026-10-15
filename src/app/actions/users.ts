'use server';

import type { OfficeFunction } from '@/lib/staffJobs';

import { cookies } from 'next/headers';
import { generatePassword } from '@/lib/passwords';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { UserRole } from '@/types/database';

const VIEW_AS_COOKIE = 'tehila_view_as';
// Real staff accounts; anything else (tehila.test, developer accounts) is a
// test account and is listed separately.
import { STAFF_EMAIL_DOMAIN } from '@/lib/demo';

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
  /** OFFICE only: REFERRALS ("משרד הפניות") / CLOSURE ("משרד סגירה"). */
  office_function: OfficeFunction | null;
  /** Login address — Amit (2026-10-11) needs it to manage people. */
  email: string | null;
  last_sign_in_at: string | null;
  /** Has at least one device registered for push. */
  has_push: boolean;
  is_staff: boolean;
  /** Two-step login (Duo): required for this person / already enrolled. */
  mfa_required: boolean;
  mfa_enrolled: boolean;
  /** Mobile number (staff_phones, CEO only) — "050-1234567". */
  phone: string | null;
  /** Login code by SMS required for this person. */
  sms_required: boolean;
}

export async function listSystemUsers(): Promise<{ data: SystemUser[]; error: string | null }> {
  const { error, supabase } = await requireCeo();
  if (error || !supabase) return { data: [], error: error ?? 'שגיאת אימות' };

  const { data, error: queryError } = await supabase
    .from('profiles')
    .select('id, full_name, role, branch_ids, is_active, is_bodywork_advisor, office_function, mfa_required, sms_required')
    .order('full_name');

  if (queryError) return { data: [], error: queryError.message };

  const rows = (data ?? []) as Array<{
    id: string;
    full_name: string;
    role: UserRole;
    branch_ids: string[];
    is_active: boolean;
    is_bodywork_advisor: boolean;
    office_function: OfficeFunction | null;
    mfa_required: boolean;
    sms_required: boolean;
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
  const phoneRows = admin ? (((await admin.from('staff_phones').select('user_id, phone')).data ?? []) as { user_id: string; phone: string }[]) : [];
  const phoneById = new Map(phoneRows.map((p) => [p.user_id, p.phone]));
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
    office_function: r.office_function ?? null,
    email: authById.get(r.id)?.email ?? null,
    last_sign_in_at: authById.get(r.id)?.last_sign_in_at ?? null,
    has_push: pushSet.has(r.id),
    is_staff: (authById.get(r.id)?.email ?? '').toLowerCase().endsWith(STAFF_EMAIL_DOMAIN),
    mfa_required: !!r.mfa_required,
    mfa_enrolled: (authById.get(r.id)?.factors ?? []).some((f) => f.status === 'verified'),
    phone: phoneById.get(r.id) ?? null,
    sms_required: !!r.sms_required,
  }));
  // Real staff first, test accounts last.
  users.sort((a, b) => Number(b.is_staff) - Number(a.is_staff));

  return { data: users, error: null };
}

export async function updateSystemUser(
  userId: string,
  updates: Partial<{ role: UserRole; branch_ids: string[]; is_active: boolean; full_name: string; office_function: OfficeFunction | null }>
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

  // The office function only means something for OFFICE.
  if (updates.role !== undefined && updates.role !== 'OFFICE' && !(updates.role === 'CEO' && updates.office_function === 'DEVELOPER')) updates = { ...updates, office_function: null };

  // Service client after the CEO check: users can't update profiles directly
  // (migration 20261015090000 — a user could otherwise change their own role).
  const admin = serviceClient();
  if (!admin) return { error: 'שרת לא מוגדר (service key)' };
  const { error: updateError } = await admin
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
  office_function?: OfficeFunction | null;
  branch_ids: string[];
}) {
  const { error, supabase, userId: callerId } = await requireCeo();
  if (error || !supabase) return { error: error ?? 'שגיאת אימות' };

  const { full_name, role, branch_ids } = params;
  const email = params.email.trim().toLowerCase();

  // Validate inputs
  if (!email || !email.includes('@')) return { error: 'דוא"ל לא תקין' };
  // Personal password (Amit, 15/10): generated here, shown once to the CEO to
  // send the person. (Until 15/10 everyone shared one server-side secret.)
  const password = generatePassword();
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
        // Decides which notifications an office user gets (staffJobs.ts).
        office_function: role === 'OFFICE' ? params.office_function ?? null : null,
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
  return { ok: true, userId: authUser.user.id, email, password };
}

/** CEO only: a staff member's mobile number (Amit, 15/10). Empty = remove. */
export async function setStaffPhone(userId: string, raw: string): Promise<{ ok?: true; error?: string; phone?: string | null }> {
  const { error } = await requireCeo();
  if (error) return { error };
  const admin = serviceClient();
  if (!admin) return { error: 'שרת לא מוגדר (service key)' };
  let d = (raw ?? '').replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  if (!d) {
    await admin.from('staff_phones').delete().eq('user_id', userId);
    revalidatePath('/settings');
    return { ok: true, phone: null };
  }
  if (!/^05\d{8}$/.test(d)) return { error: 'מספר נייד לא תקין (05X-XXXXXXX)' };
  const phone = `${d.slice(0, 3)}-${d.slice(3)}`;
  const { error: upErr } = await admin.from('staff_phones').upsert({ user_id: userId, phone, updated_at: new Date().toISOString() } as never, { onConflict: 'user_id' });
  if (upErr) return { error: upErr.message };
  revalidatePath('/settings');
  return { ok: true, phone };
}

/** CEO only: require the SMS login code for one person, or for everyone who has a mobile number ('ALL'). */
export async function setSmsRequired(userId: string, required: boolean): Promise<{ ok?: true; error?: string; count?: number; withoutPhone?: string[] }> {
  const { error } = await requireCeo();
  if (error) return { error };
  const admin = serviceClient();
  if (!admin) return { error: 'שרת לא מוגדר (service key)' };
  const phones = new Set((((await admin.from('staff_phones').select('user_id')).data ?? []) as { user_id: string }[]).map((p) => p.user_id));
  if (userId !== 'ALL') {
    if (required && !phones.has(userId)) return { error: 'קודם מוסיפים מספר נייד לעובד' };
    const { error: upErr } = await admin.from('profiles').update({ sms_required: required } as never).eq('id', userId);
    if (upErr) return { error: upErr.message };
    revalidatePath('/settings');
    return { ok: true, count: 1 };
  }
  const { data: active } = await admin.from('profiles').select('id, full_name').eq('is_active', true);
  const list = (active ?? []) as { id: string; full_name: string | null }[];
  const ids = list.filter((p) => phones.has(p.id)).map((p) => p.id);
  if (ids.length) {
    const { error: upErr } = await admin.from('profiles').update({ sms_required: required } as never).in('id', ids);
    if (upErr) return { error: upErr.message };
  }
  revalidatePath('/settings');
  return { ok: true, count: ids.length, withoutPhone: list.filter((p) => !phones.has(p.id)).map((p) => p.full_name ?? '—') };
}

/** CEO only: forget a person's remembered phones (lost phone) — the next sign-in asks for a code. */
export async function forgetTrustedDevices(userId: string): Promise<{ ok?: true; error?: string }> {
  const { error } = await requireCeo();
  if (error) return { error };
  const admin = serviceClient();
  if (!admin) return { error: 'שרת לא מוגדר (service key)' };
  const { error: delErr } = await admin.from('trusted_devices').delete().eq('user_id', userId);
  if (delErr) return { error: delErr.message };
  return { ok: true };
}

/** CEO only: require Duo for one person, or for everyone (userId = 'ALL'). */
export async function setMfaRequired(userId: string, required: boolean): Promise<{ ok?: true; error?: string; count?: number }> {
  const { error } = await requireCeo();
  if (error) return { error };
  const admin = serviceClient();
  if (!admin) return { error: 'שרת לא מוגדר (service key)' };
  const q = admin.from('profiles').update({ mfa_required: required } as never);
  const { data, error: upErr } = userId === 'ALL' ? await q.eq('is_active', true).select('id') : await q.eq('id', userId).select('id');
  if (upErr) return { error: upErr.message };
  revalidatePath('/settings');
  return { ok: true, count: (data ?? []).length };
}

/** CEO only: remove a person's Duo link (new phone / lost phone) — they enrol again on the next sign-in. */
export async function resetUserMfa(userId: string): Promise<{ ok?: true; error?: string; removed?: number }> {
  const { error } = await requireCeo();
  if (error) return { error };
  const admin = serviceClient();
  if (!admin) return { error: 'שרת לא מוגדר (service key)' };
  const { data, error: listErr } = await admin.auth.admin.mfa.listFactors({ userId });
  if (listErr) return { error: listErr.message };
  let removed = 0;
  for (const f of data?.factors ?? []) {
    const { error: delErr } = await admin.auth.admin.mfa.deleteFactor({ userId, id: f.id });
    if (delErr) return { error: delErr.message };
    removed++;
  }
  revalidatePath('/settings');
  return { ok: true, removed };
}

/** CEO only (Amit: "רק אני יכול לאפס"): a new personal password, shown once. */
export async function resetUserPassword(userId: string): Promise<{ ok?: true; error?: string; password?: string; email?: string; name?: string }> {
  const { error } = await requireCeo();
  if (error) return { error };
  const admin = serviceClient();
  if (!admin) return { error: 'שרת לא מוגדר (service key)' };
  const { data: prof } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle();
  const password = generatePassword();
  const { data, error: upErr } = await admin.auth.admin.updateUserById(userId, { password });
  if (upErr || !data.user) return { error: upErr?.message ?? 'המשתמש לא נמצא' };
  return { ok: true, password, email: data.user.email ?? '', name: (prof as { full_name: string | null } | null)?.full_name ?? '' };
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
