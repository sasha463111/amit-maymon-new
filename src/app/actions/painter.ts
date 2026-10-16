'use server';

import { safeExt } from '@/lib/storageKey';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { branchRecipients } from '@/lib/recipients';

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
  const now = new Date().toISOString();
  const caseUpdates: Record<string, unknown> = {};
  if (updates.painter_entered_work !== undefined) {
    caseUpdates.painter_status = updates.painter_entered_work ? 'IN_WORK' : 'WAITING_PARTS';
    caseUpdates.painter_entered_work_at = updates.painter_entered_work ? now : null;
  }
  if (updates.parts_arrived !== undefined) {
    caseUpdates.parts_arrived = updates.parts_arrived;
    caseUpdates.parts_arrived_at = updates.parts_arrived ? now : null;
    if (updates.parts_arrived) caseUpdates.painter_status = 'PARTS_ARRIVED';
  }

  const { error } = await supabase
    .from('cases')
    .update(caseUpdates as never)
    .eq('id', caseId);

  if (error) return { error: error.message };

  // Notify painters in the branch when parts arrive — they can resume work.
  if (updates.parts_arrived === true) {
    const { data: caseData } = await supabase
      .from('cases')
      .select('branch_id, case_key, customer_name, cars(license_plate)')
      .eq('id', caseId)
      .single();
    const c = caseData as { branch_id: string; case_key: string | null; customer_name: string | null; cars: { license_plate: string | null } | null } | null;
    const plate = (Array.isArray(c?.cars) ? c?.cars[0]?.license_plate : c?.cars?.license_plate) ?? c?.case_key ?? 'תיק';
    const customer = c?.customer_name?.trim() || plate;
    const branchUsers = await branchRecipients(supabase, c?.branch_id);
    let recipients = branchUsers.filter((p) => p.role === 'PAINTER').map((p) => ({ id: p.id }));
    if (recipients.length === 0) {
      recipients = branchUsers
        .filter((p) => p.role === 'SERVICE_MANAGER' || p.role === 'SERVICE_ADVISOR' || p.is_bodywork_advisor === true)
        .map((p) => ({ id: p.id }));
    }
    const title = 'חלקים הגיעו';
    const body = `${customer} · ${plate} - אפשר להמשיך בעבודה`;
    // Sequential, not Promise.all: concurrent inserts race the DB fan-out
    // trigger's (031/032) 10-second de-dup check against each other, so
    // several can all pass the "not already sent" check before any of their
    // fan-out copies commit — real duplicate notifications to CEOs/
    // cross-branch advisors. These lists are small, so serializing costs
    // nothing that matters.
    for (const p of recipients.filter((r) => r.id !== user.id)) {
      const { error: notifErr } = await supabase.from('notifications').insert({
        user_id: p.id,
        case_id: caseId,
        type: 'OTHER',
        title,
        body,
        action_url: `/painters/${caseId}`,
        triggered_by: user.id,
      } as never);
      if (notifErr) console.error('[notifications] insert failed', notifErr);
    }
    // Notify PAINTER + CEO for audit trail
  }

  revalidatePath(`/painters/${caseId}`);
  revalidatePath(`/cases/${caseId}`);
  return { ok: true, error: null, at: now };
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

  // Upload images if provided. Parallelized across files, so each path needs
  // to be unique on its own — a bare `Date.now()` per iteration isn't safe
  // once uploads race each other (two fast uploads can land in the same
  // millisecond and overwrite one another). Index makes each path unique
  // regardless of timing.
  if (imageFiles) {
    const files = (imageFiles.getAll('images') as File[]).filter((f) => f instanceof File);
    await Promise.all(
      files.map(async (file, i) => {
        const ext = safeExt(file.name, 'jpg');
        const path = `${caseId}/${reqId}/${Date.now()}-${i}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('painter-images')
          .upload(path, file, { contentType: file.type });
        if (!uploadErr) {
          await supabase
            .from('painter_request_images')
            .insert({ request_id: reqId, image_path: path } as never);
        }
      })
    );
  }

  // Notify bodywork advisors of this branch
  const { data: caseData } = await supabase
    .from('cases')
    .select('branch_id, case_key, cars(license_plate)')
    .eq('id', caseId)
    .single();
  const c = caseData as { branch_id: string; case_key: string | null; cars: { license_plate: string | null } | null } | null;
  const plateLabel = (Array.isArray(c?.cars) ? c?.cars[0]?.license_plate : c?.cars?.license_plate) ?? c?.case_key ?? 'תיק';

  const branchUsers = await branchRecipients(supabase, c?.branch_id);
  const advisors = branchUsers
    .filter((p) => p.is_bodywork_advisor === true || p.role === 'SERVICE_MANAGER' || p.role === 'SERVICE_ADVISOR');

  const typeLabel = requestType === 'WORK' ? 'עבודה' : 'חלקים';
  const reqTitle = `בקשת פחח - ${typeLabel}`;
  const reqBody = `רכב ${plateLabel}: ${description.trim()}`;
  // ?highlight=<request id> so the click lands scrolled-to and highlighted
  // on this specific request, not just "somewhere on the painter screen" —
  // same reasoning/pattern as the approvals highlight.
  const reqUrl = `/painters/${caseId}?highlight=${reqId}`;
  // Sequential — see the comment on the identical pattern in
  // updatePainterChecklist above (race against the DB fan-out trigger).
  for (const adv of advisors.filter((a) => a.id !== user.id)) {
    const { error: notifErr } = await supabase.from('notifications').insert({
      user_id: adv.id,
      case_id: caseId,
      type: 'PAINTER_REQUEST',
      title: reqTitle,
      body: reqBody,
      action_url: reqUrl,
      triggered_by: user.id,
    } as never);
    if (notifErr) console.error('[notifications] insert failed', notifErr);
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

/** Update painter request status (SERVICE_MANAGER / CEO). Sends a push back
 *  to the painter who opened the request whenever a manager acts on it.
 *  `note` is the manually-typed comment shown in the response modal on the
 *  case page — stored so the painter (and anyone reviewing later) can see
 *  *why* it was marked done/rejected, not just the bare status flip. */
export async function updatePainterRequestStatus(
  requestId: string,
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'REJECTED',
  note?: string | null
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
  // SERVICE_ADVISOR can respond too: painter requests are routed to service and
  // bodywork advisors precisely so they can answer them, so the people the
  // system asks to handle a request must be able to actually handle it.
  if (role !== 'SERVICE_MANAGER' && role !== 'CEO' && role !== 'SERVICE_ADVISOR') {
    return { error: 'אין הרשאה לעדכן סטטוס בקשה' };
  }

  // Fetch the request so we can notify the original painter + link back to the case.
  const { data: reqRow } = await supabase
    .from('painter_requests')
    .select('id, case_id, description, request_type, created_by')
    .eq('id', requestId)
    .single();
  const req = reqRow as {
    id: string;
    case_id: string;
    description: string;
    request_type: string;
    created_by: string | null;
  } | null;
  if (!req) return { error: 'הבקשה לא נמצאה' };

  const { error } = await supabase
    .from('painter_requests')
    .update({ status, response_note: note?.trim() || null } as never)
    .eq('id', requestId);

  if (error) return { error: error.message };

  // Notify the painter who opened the request.
  if (req.created_by && req.created_by !== user.id) {
    const { data: caseData } = await supabase
      .from('cases')
      .select('case_key, cars(license_plate)')
      .eq('id', req.case_id)
      .single();
    const c = caseData as { case_key: string | null; cars: { license_plate: string | null } | null } | null;
    const plate = (Array.isArray(c?.cars) ? c?.cars[0]?.license_plate : c?.cars?.license_plate) ?? c?.case_key ?? 'תיק';
    const STATUS_LABELS: Record<string, string> = {
      PENDING: 'הוחזרה לטיפול',
      IN_PROGRESS: 'בטיפול',
      DONE: 'בוצעה',
      REJECTED: 'נדחתה',
    };
    const title = `הבקשה שלך ${STATUS_LABELS[status] ?? status}`;
    const body = note?.trim()
      ? `${plate} · ${note.trim()}`
      : `${plate} · ${req.description.slice(0, 80)}`;
    const statusUrl = `/painters/${req.case_id}?highlight=${requestId}`;
    const { error: notifErr } = await supabase.from('notifications').insert({
      user_id: req.created_by,
      case_id: req.case_id,
      type: 'OTHER',
      title,
      body,
      action_url: statusUrl,
      triggered_by: user.id,
    } as never);
    if (notifErr) console.error('[notifications] insert failed', notifErr);
  }

  return { ok: true, error: null };
}

/**
 * "סיום עבודה" (Amit, 2026-10-12): the painter's work on the car is done.
 * The case leaves the PAINTERS board only — it stays in "תיקים" and runs on
 * until the office closes it (the office often finishes later than the
 * workshop). `finished=false` puts it back on the board (pressed by mistake).
 * The branch's service advisors are told the car is physically ready.
 */
export async function setPainterFinished(caseId: string, finished: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };
  const { data: profileData } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = (profileData as { role: string } | null)?.role;
  if (role !== 'PAINTER' && role !== 'SERVICE_MANAGER' && role !== 'SERVICE_ADVISOR' && role !== 'CEO') {
    return { error: 'אין הרשאה' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('cases')
    .update((finished
      ? { painter_finished_at: now, painter_finished_by: user.id, painter_status: 'READY_FOR_RELEASE' }
      : { painter_finished_at: null, painter_finished_by: null }) as never)
    .eq('id', caseId);
  if (error) return { error: error.message };

  if (finished) {
    const { data: caseData } = await supabase
      .from('cases')
      .select('branch_id, case_key, customer_name, cars(license_plate)')
      .eq('id', caseId)
      .single();
    const c = caseData as { branch_id: string; case_key: string | null; customer_name: string | null; cars: { license_plate: string | null } | { license_plate: string | null }[] | null } | null;
    const car = Array.isArray(c?.cars) ? c?.cars[0] : c?.cars;
    const plate = car?.license_plate ?? c?.case_key ?? 'תיק';
    const customer = c?.customer_name?.trim() || plate;
    const advisors = (await branchRecipients(supabase, c?.branch_id))
      .filter((p) => (p.role === 'SERVICE_ADVISOR' || p.role === 'SERVICE_MANAGER') && p.id !== user.id);
    // Sequential — see the note in updatePainterChecklist. Pushed by the DB
    // dispatcher; notification_is_relevant routes this "case flow" kind to
    // advisors and the CEO.
    for (const a of advisors) {
      await supabase.from('notifications').insert({
        user_id: a.id,
        case_id: caseId,
        type: 'PAINTER_FINISHED',
        title: '✅ הפחח סיים עבודה',
        body: `${customer} · ${plate} - הרכב מוכן פיזית`,
        action_url: `/cases/${caseId}`,
        triggered_by: user.id,
      } as never);
    }
  }

  revalidatePath(`/painters/${caseId}`);
  revalidatePath('/painters');
  revalidatePath(`/cases/${caseId}`);
  return { ok: true, at: finished ? now : null };
}

/** "קיבלתי את תוספת החלקים" (Amit, 2026-10-14): the painter confirms that the
 *  extra parts of a PARTS request (already marked done by an advisor) reached
 *  him. painter_requests UPDATE is for advisors under RLS, so the write goes
 *  through the service client — after checking the caller can see the request. */
export async function confirmPartsReceived(requestId: string, received: boolean): Promise<{ error?: string; ok?: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role: string } | null)?.role;
  if (!role || !['PAINTER', 'CEO', 'SERVICE_MANAGER'].includes(role)) return { error: 'אין הרשאה' };
  const { data: row } = await supabase.from('painter_requests').select('id, case_id, request_type, status').eq('id', requestId).maybeSingle();
  const req = row as { id: string; case_id: string; request_type: string; status: string } | null;
  if (!req) return { error: 'הבקשה לא נמצאה' };
  if (req.request_type !== 'PARTS') return { error: 'רק בבקשת חלקים' };
  if (req.status !== 'DONE') return { error: 'אפשר לאשר קבלה אחרי שהיועץ סימן שהחלקים טופלו' };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: 'שרת לא מוגדר' };
  const { createClient: createServiceClient } = await import('@supabase/supabase-js');
  const db = createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await db
    .from('painter_requests')
    .update({ received_at: received ? new Date().toISOString() : null, received_by: received ? user.id : null } as never)
    .eq('id', requestId);
  if (error) return { error: error.message };
  revalidatePath(`/painters/${req.case_id}`);
  revalidatePath(`/cases/${req.case_id}`);
  return { ok: true };
}
