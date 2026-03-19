'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ApprovalDecisionInput } from '@/types/database';

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

  if (input.status === 'REJECTED') {
    const { data: caseData } = await supabase
      .from('cases')
      .select('branch_id')
      .eq('id', approval.case_id)
      .single();
    const branchId = (caseData as { branch_id: string } | null)?.branch_id;
    const { data: managers } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'SERVICE_MANAGER')
      .eq('branch_id', branchId ?? '');
    for (const m of (managers ?? []) as { id: string }[]) {
      await supabase.from('notifications').insert({
        user_id: m.id,
        type: 'CEO_REJECTED',
        title: 'אישור נדחה',
        body: input.rejection_note ?? 'עמית דחה אישור',
        case_id: approval.case_id,
      } as never);
    }
  }

  // Auto-complete READY_FOR_OFFICE when all required approvals are approved
  if (input.status === 'APPROVED') {
    const { data: allApprovals } = await supabase
      .from('ceo_approvals')
      .select('approval_type, status')
      .eq('case_id', approval.case_id);
    const approvals = (allApprovals ?? []) as { approval_type: string; status: string }[];
    const estimateOk = approvals.some(
      (a) => a.approval_type === 'ESTIMATE_AND_DETAILS' && a.status === 'APPROVED'
    );
    const wheelsEntry = approvals.find((a) => a.approval_type === 'WHEELS_CHECK');
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
