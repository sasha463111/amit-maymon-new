'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// Manual "סטטוס" for a case in closure (Amit, 2026-10-12): a log like the
// referrals' "מעקב הפנייה"; the latest note is copied onto the case
// (closure_status_note/_at) so the closure list shows it on the card.
// Office and CEO only (RLS on closure_status_updates enforces it too).

export type ClosureStatusUpdate = { id: string; note: string; created_at: string; author: string | null };

async function officeOrCeo() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' as const };
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (data as { role: string } | null)?.role;
  if (role !== 'OFFICE' && role !== 'CEO') return { error: 'אין הרשאה' as const };
  return { supabase, user };
}

export async function addClosureStatusUpdate(caseId: string, note: string) {
  const auth = await officeOrCeo();
  if ('error' in auth) return { error: auth.error };
  const text = note.trim().slice(0, 500);
  if (!text) return { error: 'נא לכתוב עדכון' };

  const { error } = await auth.supabase
    .from('closure_status_updates')
    .insert({ case_id: caseId, note: text, created_by: auth.user.id } as never);
  if (error) return { error: error.message };

  const at = new Date().toISOString();
  const { error: patchErr } = await auth.supabase
    .from('cases')
    .update({ closure_status_note: text, closure_status_at: at } as never)
    .eq('id', caseId);
  if (patchErr) console.error('[closureStatus] case sync failed', patchErr);

  revalidatePath('/closure');
  revalidatePath(`/closure/${caseId}`);
  return { ok: true, at };
}

export async function getClosureStatusUpdates(caseId: string): Promise<{ data: ClosureStatusUpdate[]; error?: string }> {
  const auth = await officeOrCeo();
  if ('error' in auth) return { data: [], error: auth.error };
  const { data, error } = await auth.supabase
    .from('closure_status_updates')
    .select('id, note, created_at, profiles(full_name)')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return { data: [], error: error.message };
  type Row = { id: string; note: string; created_at: string; profiles: { full_name: string | null } | { full_name: string | null }[] | null };
  return {
    data: ((data ?? []) as Row[]).map((r) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      return { id: r.id, note: r.note, created_at: r.created_at, author: p?.full_name ?? null };
    }),
  };
}
