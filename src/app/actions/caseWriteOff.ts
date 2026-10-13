'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// "🚫 רכב לא לתיקון / מושבת" (Amit, 2026-10-13): the car will not be repaired
// (total loss, customer took it elsewhere…). The case is CLOSED — it leaves
// every open list, workflows end — and is kept in the archive tab "מושבתים",
// apart from cases that were repaired and closed. CEO only for now (new
// features go to Amit first). Reversible: "↩️ החזר לטיפול".

async function ceo() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if ((data as { role: string } | null)?.role !== 'CEO') return null;
  return { supabase, userId: user.id };
}

function closeOpenNotifications(caseId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Promise.resolve();
  const admin = createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin
    .from('notifications')
    .update({ read: true } as never)
    .eq('case_id', caseId)
    .eq('read', false)
    .then(({ error }) => {
      if (error) console.error('[writeOffCase] could not close notifications', error.message);
    });
}

export async function writeOffCase(caseId: string, reason: string) {
  const ctx = await ceo();
  if (!ctx) return { error: 'רק המנכ"ל יכול לסמן רכב כמושבת' };
  const { supabase, userId } = ctx;
  const note = reason.trim().slice(0, 300) || null;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('cases')
    .update({ closed_at: now, general_status: 'COMPLETED', written_off_at: now, written_off_by: userId, written_off_reason: note } as never)
    .eq('id', caseId)
    .is('closed_at', null)
    .is('deleted_at', null)
    .select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'התיק כבר סגור או נמחק' };

  // Every workflow of the case ends — nothing left to do on it.
  await supabase.from('case_workflow_runs').update({ status: 'COMPLETED' } as never).eq('case_id', caseId).eq('status', 'ACTIVE');
  await supabase.from('audit_events').insert({
    entity_type: 'CASE',
    entity_id: caseId,
    action: 'CASE_WRITTEN_OFF',
    user_id: userId,
    payload: note ? { reason: note } : null,
  } as never);
  await closeOpenNotifications(caseId);

  revalidatePath('/cases');
  revalidatePath('/cases/archive');
  revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}

/** Undo: the case is open again and its last workflow continues. */
export async function restoreWrittenOffCase(caseId: string) {
  const ctx = await ceo();
  if (!ctx) return { error: 'רק המנכ"ל' };
  const { supabase, userId } = ctx;

  const { data, error } = await supabase
    .from('cases')
    .update({ closed_at: null, general_status: 'IN_PROGRESS', written_off_at: null, written_off_by: null, written_off_reason: null } as never)
    .eq('id', caseId)
    .not('written_off_at', 'is', null)
    .select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'התיק לא מסומן כמושבת' };

  const { data: runs } = await supabase
    .from('case_workflow_runs')
    .select('id')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(1);
  const last = (runs ?? []) as { id: string }[];
  if (last[0]) await supabase.from('case_workflow_runs').update({ status: 'ACTIVE' } as never).eq('id', last[0].id);

  await supabase.from('audit_events').insert({
    entity_type: 'CASE',
    entity_id: caseId,
    action: 'CASE_WRITE_OFF_UNDONE',
    user_id: userId,
    payload: null,
  } as never);

  revalidatePath('/cases');
  revalidatePath('/cases/archive');
  revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}
