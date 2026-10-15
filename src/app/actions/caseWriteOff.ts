'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// "🚫 רכב לא לתיקון / מושבת" (Amit, 2026-10-13): the car will not be repaired
// (total loss, customer took it elsewhere…). The case is CLOSED — it leaves
// every open list, workflows end — and is kept in the archive tab "מושבתים",
// apart from cases that were repaired and closed. Reversible: "↩️ החזר לטיפול".
// Who (Amit, 2026-10-13: "לכל מי שרלוונטי"): whoever runs a case — CEO,
// service manager, advisors, collections — and the same people can undo it; the
// CEO is told (push) whenever someone else brings a case back.
// Branch reach is enforced by RLS (an update outside it changes 0 rows).
// (A 'use server' file may export only async functions — keep this private.)
const WRITE_OFF_ROLES = ['CEO', 'SERVICE_ADVISOR', 'COLLECTIONS'];

async function actor(roles: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
  const p = data as { role: string; is_active: boolean } | null;
  if (!p || p.is_active === false || !roles.includes(p.role)) return null;
  return { supabase, userId: user.id, role: p.role };
}

function serviceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** "↩️ תיק מושבת הוחזר לטיפול" to every active CEO — type CASE_RESTORED is
 *  in the CEO ACTION tier (ceo_notification_tier), so it is pushed too. */
async function tellCeoRestored(caseId: string, byUserId: string) {
  const db = serviceDb();
  if (!db) return;
  const [{ data: ceos }, { data: c }, { data: me }] = await Promise.all([
    db.from('profiles').select('id').eq('role', 'CEO').eq('is_active', true),
    db.from('cases').select('customer_name, cars(license_plate)').eq('id', caseId).maybeSingle(),
    db.from('profiles').select('full_name').eq('id', byUserId).maybeSingle(),
  ]);
  const row = c as { customer_name: string | null; cars: { license_plate: string | null } | { license_plate: string | null }[] | null } | null;
  const car = Array.isArray(row?.cars) ? row?.cars[0] : row?.cars;
  const who = (me as { full_name: string | null } | null)?.full_name ?? 'משתמש';
  const what = [row?.customer_name, car?.license_plate ? `רכב ${car.license_plate}` : null].filter(Boolean).join(' · ');
  const targets = ((ceos ?? []) as { id: string }[]).filter((x) => x.id !== byUserId);
  if (!targets.length) return;
  const { error } = await db.from('notifications').insert(
    targets.map((x) => ({
      user_id: x.id,
      case_id: caseId,
      type: 'CASE_RESTORED',
      title: '↩️ תיק מושבת הוחזר לטיפול',
      body: `${what || 'תיק'} — הוחזר ע"י ${who}`,
      action_url: `/cases/${caseId}`,
      triggered_by: byUserId,
      read: false,
    })) as never,
  );
  if (error) console.error('[restoreWrittenOffCase] CEO notification failed', error.message);
}

function closeOpenNotifications(caseId: string) {
  const admin = serviceDb();
  if (!admin) return Promise.resolve();
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
  const ctx = await actor(WRITE_OFF_ROLES);
  if (!ctx) return { error: 'אין הרשאה לסמן רכב כמושבת' };
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
  if (!data?.length) return { error: 'התיק כבר סגור, נמחק, או בסניף אחר' };

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
  const ctx = await actor(WRITE_OFF_ROLES);
  if (!ctx) return { error: 'אין הרשאה להחזיר לטיפול' };
  const { supabase, userId, role } = ctx;

  const { data, error } = await supabase
    .from('cases')
    .update({ closed_at: null, general_status: 'IN_PROGRESS', written_off_at: null, written_off_by: null, written_off_reason: null } as never)
    .eq('id', caseId)
    .not('written_off_at', 'is', null)
    .select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'התיק לא מסומן כמושבת, או בסניף אחר' };

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
  if (role !== 'CEO') await tellCeoRestored(caseId, userId);

  revalidatePath('/cases');
  revalidatePath('/cases/archive');
  revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}
