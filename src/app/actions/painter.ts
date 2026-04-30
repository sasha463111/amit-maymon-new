'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/** Update painter checklist fields on the case */
export async function updatePainterChecklist(
  caseId: string,
  updates: { painter_entered_work?: boolean; parts_arrived?: boolean }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = (profileData as { role: string } | null)?.role;
  if (role !== 'PAINTER' && role !== 'SERVICE_MANAGER' && role !== 'CEO') {
    return { error: 'אין הרשאה' };
  }

  // Map painter_entered_work → painter_status
  const caseUpdates: Record<string, unknown> = {};
  if (updates.painter_entered_work !== undefined) {
    caseUpdates.painter_status = updates.painter_entered_work ? 'IN_WORK' : 'WAITING_PARTS';
  }
  if (updates.parts_arrived !== undefined) {
    caseUpdates.parts_arrived = updates.parts_arrived;
    if (updates.parts_arrived) caseUpdates.painter_status = 'PARTS_ARRIVED';
  }

  const { error } = await supabase
    .from('cases')
    .update(caseUpdates as never)
    .eq('id', caseId);

  if (error) return { error: error.message };
  revalidatePath(`/painters/${caseId}`);
  return { ok: true, error: null };
}

/** Create a painter request (free text + optional images) and notify bodywork advisors */
export async function createPainterRequest(
  caseId: string,
  description: string,
  requestType: 'WORK' | 'PARTS',
  imageFiles?: FormData
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = (profileData as { role: string } | null)?.role;
  if (role !== 'PAINTER' && role !== 'SERVICE_MANAGER' && role !== 'CEO') {
    return { error: 'אין הרשאה' };
  }

  if (!description.trim()) return { error: 'נדרש תיאור הבקשה' };

  // Insert the request
  const { data: reqData, error: reqError } = await supabase
    .from('painter_requests')
    .insert({
      case_id: caseId,
      description: description.trim(),
      request_type: requestType,
      created_by: user.id,
    } as never)
    .select('id')
    .single();

  if (reqError) return { error: reqError.message };
  const reqId = (reqData as { id: string }).id;

  // Upload images if provided
  if (imageFiles) {
    const files = imageFiles.getAll('images') as File[];
    for (const file of files) {
      if (!(file instanceof File)) continue;
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${caseId}/${reqId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('painter-images')
        .upload(path, file, { contentType: file.type });
      if (!uploadErr) {
        await supabase
          .from('painter_request_images')
          .insert({ request_id: reqId, image_path: path } as never);
      }
    }
  }

  // Notify bodywork advisors of this branch
  const { data: caseData } = await supabase
    .from('cases')
    .select('branch_id, case_key, cars(license_plate)')
    .eq('id', caseId)
    .single();
  const c = caseData as { branch_id: string; case_key: string | null; cars: { license_plate: string | null } | null } | null;
  const plateLabel = (Array.isArray(c?.cars) ? c?.cars[0]?.license_plate : c?.cars?.license_plate) ?? c?.case_key ?? 'תיק';

  const { data: advisors } = await supabase
    .from('profiles')
    .select('id')
    .eq('branch_id', c?.branch_id ?? '')
    .eq('is_bodywork_advisor', true);

  const typeLabel = requestType === 'WORK' ? 'עבודה' : 'חלקים';
  for (const adv of (advisors ?? []) as { id: string }[]) {
    await supabase.from('notifications').insert({
      user_id: adv.id,
      case_id: caseId,
      type: 'PAINTER_REQUEST',
      title: `בקשת פחח — ${typeLabel}`,
      body: `רכב ${plateLabel}: ${description.trim()}`,
      action_url: `/painters/${caseId}`,
      triggered_by: user.id,
    } as never);
  }

  revalidatePath(`/painters/${caseId}`);
  return { ok: true, requestId: reqId, error: null };
}

/** Get painter requests for a case */
export async function getPainterRequests(caseId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: 'לא מחובר' };

  const { data, error } = await supabase
    .from('painter_requests')
    .select('id, description, request_type, status, created_at')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

/** Update painter request status (SERVICE_MANAGER / CEO) */
export async function updatePainterRequestStatus(
  requestId: string,
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE'
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = (profileData as { role: string } | null)?.role;
  if (role !== 'SERVICE_MANAGER' && role !== 'CEO') {
    return { error: 'רק מנהל שירות יכול לעדכן סטטוס בקשה' };
  }

  const { error } = await supabase
    .from('painter_requests')
    .update({ status } as never)
    .eq('id', requestId);

  if (error) return { error: error.message };
  return { ok: true, error: null };
}
