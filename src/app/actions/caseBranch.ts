'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// Move a case to the other branch (Amit, 2026-10-14: opened in Ashkelon but
// repaired in Netivot). Whoever edits cases may do it, to a branch they work in.
// Branch reach is enforced by RLS too; the car record follows the case.
const MOVE_ROLES = new Set(['CEO', 'SERVICE_MANAGER', 'SERVICE_ADVISOR', 'OFFICE']);

async function me() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role, branch_ids, sees_all_branches, is_active').eq('id', user.id).maybeSingle();
  const p = data as { role: string; branch_ids: string[] | null; sees_all_branches?: boolean; is_active?: boolean } | null;
  if (!p || p.is_active === false || !MOVE_ROLES.has(p.role)) return null;
  return { supabase, userId: user.id, profile: p };
}

/** Branches this user may move a case to. Empty = no permission. */
export async function getMoveTargets(): Promise<{ id: string; name: string }[]> {
  const ctx = await me();
  if (!ctx) return [];
  const { data } = await ctx.supabase.from('branches').select('id, name').order('name');
  const all = (data ?? []) as { id: string; name: string }[];
  const { role, branch_ids, sees_all_branches } = ctx.profile;
  return role === 'CEO' || sees_all_branches ? all : all.filter((b) => (branch_ids ?? []).includes(b.id));
}

export async function moveCaseToBranch(caseId: string, branchId: string) {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה להעביר תיק בין סניפים' };
  const targets = await getMoveTargets();
  const target = targets.find((b) => b.id === branchId);
  if (!target) return { error: 'אין הרשאה לסניף הזה' };

  const { data: cur } = await ctx.supabase.from('cases').select('branch_id, car_id').eq('id', caseId).maybeSingle();
  const row = cur as { branch_id: string; car_id: string | null } | null;
  if (!row) return { error: 'תיק לא נמצא' };
  if (row.branch_id === branchId) return { ok: true };

  const { data: moved, error } = await ctx.supabase.from('cases').update({ branch_id: branchId } as never).eq('id', caseId).select('id');
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) return { error: `בסניף ${target.name} כבר יש תיק פתוח לרכב הזה` };
    return { error: error.message };
  }
  if (!moved?.length) return { error: 'התיק לא הועבר (אין הרשאה לתיק)' };

  // The car belongs to the branch that repairs it.
  if (row.car_id) {
    const { error: carErr } = await ctx.supabase.from('cars').update({ branch_id: branchId } as never).eq('id', row.car_id);
    if (carErr) console.error('[moveCaseToBranch] car branch not updated', carErr.message);
  }
  await ctx.supabase.from('audit_events').insert({
    entity_type: 'CASE',
    entity_id: caseId,
    action: 'CASE_UPDATED',
    user_id: ctx.userId,
    payload: { fields: ['branch_id'], from_branch: row.branch_id, to_branch: branchId, to_branch_name: target.name },
  } as never);

  revalidatePath('/cases');
  revalidatePath(`/cases/${caseId}`);
  return { ok: true, branchName: target.name };
}
