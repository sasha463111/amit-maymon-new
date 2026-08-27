'use server';

import { createClient } from '@/lib/supabase/server';
import { sendPushToUser, pushToOverseers } from '@/app/actions/push';
import { branchRecipients } from '@/lib/recipients';
import type { CreateExtraInput, UpdateExtraStatusInput } from '@/types/database';

export async function createExtra(input: CreateExtraInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  const { data: profileData } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();
  const profile = profileData as { id: string; role: string } | null;
  if (profile?.role !== 'PAINTER') return { error: 'רק פחח יכול ליצור תוספת' };

  const { data: extraData, error: insertErr } = await supabase
    .from('bodywork_extras')
    .insert({
      case_id: input.case_id,
      description: input.description,
      image_path: input.image_path,
      status: 'IN_TREATMENT',
      created_by: user.id,
    } as never)
    .select('id')
    .single();

  if (insertErr) return { error: insertErr.message };
  if (!extraData) return { error: 'שגיאה ביצירת תוספת' };
  const extra = extraData as { id: string };

  const { data: caseData } = await supabase
    .from('cases')
    .select('branch_id')
    .eq('id', input.case_id)
    .single();
  const branchId = (caseData as { branch_id: string } | null)?.branch_id;
  const managers = (await branchRecipients(supabase, branchId))
    .filter((p) => p.role === 'SERVICE_MANAGER');
  const extraTitle = 'תוספת חדשה';
  const extraBody = input.description;
  for (const m of managers) {
    await supabase.from('notifications').insert({
      user_id: m.id,
      case_id: input.case_id,
      type: 'EXTRA_CREATED',
      title: extraTitle,
      body: extraBody,
      action_url: `/cases/${input.case_id}`,
      triggered_by: user.id,
    } as never);
    await sendPushToUser(m.id, { title: extraTitle, body: extraBody, url: `/cases/${input.case_id}`, tag: `extra-${input.case_id}` });
  }
  await pushToOverseers({ title: extraTitle, body: extraBody, url: `/cases/${input.case_id}`, tag: `extra-${input.case_id}` }, user.id);

  await supabase.from('audit_events').insert({
    entity_type: 'EXTRA',
    entity_id: extra.id,
    action: 'EXTRA_CREATED',
    user_id: user.id,
    payload: { case_id: input.case_id },
  } as never);

  return { extraId: extra.id };
}

export async function updateExtraStatus(input: UpdateExtraStatusInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const profile = profileData as { role: string } | null;
  if (profile?.role !== 'SERVICE_MANAGER' && profile?.role !== 'CEO') {
    return { error: 'רק מנהל שירות יכול לעדכן סטטוס' };
  }

  // Fetch the extra (so we know who the painter was) BEFORE updating, so we
  // can notify the right person after the status flip.
  const { data: extraRow } = await supabase
    .from('bodywork_extras')
    .select('case_id, description, created_by')
    .eq('id', input.extra_id)
    .single();
  const extra = extraRow as { case_id: string; description: string; created_by: string | null } | null;

  const { error: updateErr } = await supabase
    .from('bodywork_extras')
    .update({ status: input.status } as never)
    .eq('id', input.extra_id);

  if (updateErr) return { error: updateErr.message };

  await supabase.from('audit_events').insert({
    entity_type: 'EXTRA',
    entity_id: input.extra_id,
    action: 'EXTRA_STATUS_CHANGED',
    user_id: user.id,
    payload: { status: input.status },
  } as never);

  // Notify the painter who created the extra that their request was decided.
  if (extra?.created_by && extra.created_by !== user.id) {
    const { data: caseData } = await supabase
      .from('cases')
      .select('case_key, customer_name, cars(license_plate)')
      .eq('id', extra.case_id)
      .single();
    const c = caseData as { case_key: string | null; customer_name: string | null; cars: { license_plate: string | null } | null } | null;
    const plate = (Array.isArray(c?.cars) ? c?.cars[0]?.license_plate : c?.cars?.license_plate) ?? c?.case_key ?? 'תיק';
    const customer = c?.customer_name?.trim() || plate;
    const STATUS_LABELS: Record<string, string> = {
      DONE: 'אושרה ✓',
      REJECTED: 'נדחתה ✗',
      IN_TREATMENT: 'בטיפול',
    };
    const title = `התוספת שלך ${STATUS_LABELS[input.status] ?? input.status}`;
    const body = `${customer} · ${plate}\n${extra.description.slice(0, 80)}`;
    await supabase.from('notifications').insert({
      user_id: extra.created_by,
      case_id: extra.case_id,
      type: 'EXTRA_STATUS_CHANGED',
      title,
      body,
      action_url: `/extras/mine`,
      triggered_by: user.id,
    } as never);
    await sendPushToUser(extra.created_by, {
      title,
      body,
      url: `/extras/mine`,
      tag: `extra-status-${input.extra_id}`,
    });
  }

  return { ok: true };
}
