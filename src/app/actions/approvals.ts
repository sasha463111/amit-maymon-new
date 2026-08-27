'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { sendPushToUser, pushToOverseers } from '@/app/actions/push';
import { branchRecipients } from '@/lib/recipients';
import type { ApprovalDecisionInput } from '@/types/database';

const APPROVAL_TYPE_LABELS: Record<string, string> = {
  ESTIMATE_AND_DETAILS: 'אומדן ופרטי תיק',
  WHEELS_CHECK: 'טפסי גלגלים',
};

export async function decideApproval(input: ApprovalDecisionInput) {
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
  if (profile?.role !== 'CEO') return { error: 'רק מנכ"ל יכול לאשר/לדחות' };

  const { data: approvalData } = await supabase
    .from('ceo_approvals')
    .select('id, case_id')
    .eq('id', input.approval_id)
    .single();
  if (!approvalData) return { error: 'אישור לא נמצא' };
  const approval = approvalData as { id: string; case_id: string };

  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('ceo_approvals')
    .update({
      status: input.status,
      rejection_note: input.status === 'REJECTED' ? input.rejection_note ?? null : null,
      decided_at: now,
      decided_by: user.id,
    } as never)
    .eq('id', input.approval_id);

  if (updateErr) return { error: updateErr.message };

  const action = input.status === 'APPROVED' ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED';
  await supabase.from('audit_events').insert({
    entity_type: 'APPROVAL',
    entity_id: input.approval_id,
    action,
    user_id: user.id,
    payload: { case_id: approval.case_id },
  } as never);

  // Fetch case context (branch + plate) once for any notification we send below.
  const { data: caseCtxData } = await supabase
    .from('cases')
    .select('branch_id, case_key, cars(license_plate)')
    .eq('id', approval.case_id)
    .single();
  const caseCtx = caseCtxData as {
    branch_id: string;
    case_key: string | null;
    cars: { license_plate: string | null } | { license_plate: string | null }[] | null;
  } | null;
  const plateLabel =
    (Array.isArray(caseCtx?.cars) ? caseCtx?.cars[0]?.license_plate : caseCtx?.cars?.license_plate) ??
    caseCtx?.case_key ?? 'תיק';
  const branchId = caseCtx?.branch_id ?? '';

  // Look up the original approval type so we can include it in notifications below.
  const { data: approvalTypeRow } = await supabase
    .from('ceo_approvals')
    .select('approval_type')
    .eq('id', input.approval_id)
    .single();
  const approvalTypeLabel = APPROVAL_TYPE_LABELS[(approvalTypeRow as { approval_type: string } | null)?.approval_type ?? ''] ?? 'אישור';

  if (input.status === 'REJECTED') {
    const managers = (await branchRecipients(supabase, branchId))
      .filter((p) => p.role === 'SERVICE_MANAGER');
    const rejTitle = `${approvalTypeLabel} נדחה`;
    const rejBody = input.rejection_note ? `${plateLabel}: ${input.rejection_note}` : `רכב ${plateLabel} - עמית דחה את האישור`;
    for (const m of managers) {
      await supabase.from('notifications').insert({
        user_id: m.id,
        case_id: approval.case_id,
        type: 'CEO_REJECTED',
        title: rejTitle,
        body: rejBody,
        action_url: `/cases/${approval.case_id}`,
        triggered_by: user.id,
      } as never);
      await sendPushToUser(m.id, { title: rejTitle, body: rejBody, url: `/cases/${approval.case_id}`, tag: `rejected-${approval.case_id}` });
    }
    await pushToOverseers({ title: rejTitle, body: rejBody, url: `/cases/${approval.case_id}`, tag: `rejected-${approval.case_id}` }, user.id);
  } else if (input.status === 'APPROVED') {
    // Notify branch SERVICE_MANAGERs that the approval went through, so they can continue.
    const managers = (await branchRecipients(supabase, branchId))
      .filter((p) => p.role === 'SERVICE_MANAGER');
    const okTitle = `${approvalTypeLabel} אושר ✓`;
    const okBody = `רכב ${plateLabel} - עמית אישר. אפשר להמשיך בטיפול.`;
    for (const m of managers) {
      await supabase.from('notifications').insert({
        user_id: m.id,
        case_id: approval.case_id,
        type: 'OTHER',
        title: okTitle,
        body: okBody,
        action_url: `/cases/${approval.case_id}`,
        triggered_by: user.id,
      } as never);
      await sendPushToUser(m.id, { title: okTitle, body: okBody, url: `/cases/${approval.case_id}`, tag: `approved-${approval.case_id}` });
    }
    await pushToOverseers({ title: okTitle, body: okBody, url: `/cases/${approval.case_id}`, tag: `approved-${approval.case_id}` }, user.id);
  }

  // Auto-complete READY_FOR_OFFICE when all required approvals are approved
  if (input.status === 'APPROVED') {
    const { data: allApprovals } = await supabase
      .from('ceo_approvals')
      .select('approval_type, status, created_at')
      .eq('case_id', approval.case_id)
      .order('created_at', { ascending: false });
    const approvals = (allApprovals ?? []) as { approval_type: string; status: string; created_at: string }[];
    // Take latest per type to avoid stale duplicates
    const latestByType = new Map<string, { status: string }>();
    for (const a of approvals) {
      if (!latestByType.has(a.approval_type)) latestByType.set(a.approval_type, a);
    }
    const estimateOk = latestByType.get('ESTIMATE_AND_DETAILS')?.status === 'APPROVED';
    const wheelsEntry = latestByType.get('WHEELS_CHECK') ?? null;
    const wheelsOk = !wheelsEntry || wheelsEntry.status === 'APPROVED';

    if (estimateOk && wheelsOk) {
      const { data: extras } = await supabase
        .from('bodywork_extras')
        .select('id')
        .eq('case_id', approval.case_id)
        .eq('status', 'IN_TREATMENT');

      if ((extras?.length ?? 0) === 0) {
        const { data: runData } = await supabase
          .from('case_workflow_runs')
          .select('id')
          .eq('case_id', approval.case_id)
          .eq('workflow_type', 'PROFESSIONAL')
          .eq('status', 'ACTIVE')
          .maybeSingle();
        const run = runData as { id: string } | null;
        if (run) {
          const { data: readyStep } = await supabase
            .from('case_workflow_steps')
            .select('id, state')
            .eq('run_id', run.id)
            .eq('step_key', 'READY_FOR_OFFICE')
            .maybeSingle();
          const step = readyStep as { id: string; state: string } | null;
          if (step?.state === 'ACTIVE') {
            const now = new Date().toISOString();
            await supabase
              .from('case_workflow_steps')
              .update({ state: 'DONE', completed_at: now, completed_by: user.id } as never)
              .eq('id', step.id);
            await supabase.from('audit_events').insert({
              entity_type: 'WORKFLOW_STEP',
              entity_id: step.id,
              action: 'STEP_COMPLETED',
              user_id: user.id,
              payload: { step_key: 'READY_FOR_OFFICE', auto_completed: true },
            } as never);
          }
        }
      }
    }
  }

  revalidatePath('/approvals');
  revalidatePath(`/cases/${approval.case_id}`);
  return { ok: true };
}
