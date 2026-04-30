'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  PROFESSIONAL_WORKFLOW_STEPS,
  type CreateCaseInput,
  type UserRole,
  type AuditEntityType,
} from '@/types/database';

function vehicleAgeYears(firstRegistrationDate: string | null): number | null {
  if (!firstRegistrationDate) return null;
  const d = new Date(firstRegistrationDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  return (now.getTime() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

async function writeAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entityType: AuditEntityType,
  entityId: string,
  action: string,
  userId: string | null,
  payload?: Record<string, unknown>
) {
  await supabase.from('audit_events').insert({
    entity_type: entityType,
    entity_id: entityId,
    action,
    user_id: userId,
    payload: payload ?? null,
  } as never);
}

// Pick the latest approval per type from a list ordered by created_at desc.
// Use this instead of .find() to avoid stale duplicate rows confusing the gate.
function latestApprovalsByType(
  approvals: { approval_type: string; status: string; created_at?: string }[]
): Map<string, { approval_type: string; status: string }> {
  const sorted = [...approvals].sort((a, b) => {
    const ad = a.created_at ?? '';
    const bd = b.created_at ?? '';
    return bd.localeCompare(ad); // desc
  });
  const map = new Map<string, { approval_type: string; status: string }>();
  for (const a of sorted) {
    if (!map.has(a.approval_type)) map.set(a.approval_type, a);
  }
  return map;
}

const APPROVAL_TYPE_LABELS: Record<string, string> = {
  ESTIMATE_AND_DETAILS: 'אומדן ופרטי תיק',
  WHEELS_CHECK: 'טפסי גלגלים',
};

// Notify all CEOs that a new approval is pending for them.
async function notifyCeosPendingApproval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  caseId: string,
  approvalType: string,
  triggeredBy: string
) {
  const { data: caseData } = await supabase
    .from('cases')
    .select('case_key, cars(license_plate)')
    .eq('id', caseId)
    .single();
  const c = caseData as { case_key: string | null; cars: { license_plate: string | null } | { license_plate: string | null }[] | null } | null;
  const plate = (Array.isArray(c?.cars) ? c?.cars[0]?.license_plate : c?.cars?.license_plate) ?? c?.case_key ?? 'תיק';

  const { data: ceos } = await supabase.from('profiles').select('id').eq('role', 'CEO');
  const label = APPROVAL_TYPE_LABELS[approvalType] ?? approvalType;
  for (const ceo of (ceos ?? []) as { id: string }[]) {
    await supabase.from('notifications').insert({
      user_id: ceo.id,
      case_id: caseId,
      type: 'PENDING_APPROVAL',
      title: `אישור ${label} ממתין`,
      body: `רכב ${plate} ממתין לאישורך`,
      action_url: `/approvals`,
      triggered_by: triggeredBy,
    } as never);
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createCase(input: CreateCaseInput) {
  const supabase = await createClient();
  if (!input.plate_number?.trim()) return { error: 'מספר רישוי חובה' };
  if (!input.branch_id || !UUID_REGEX.test(input.branch_id)) return { error: 'סניף לא תקין' };
  const firstRegDate = input.first_registration_date?.trim() || null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  const { data: profileData } = await supabase
    .from('profiles')
    .select('id, role, branch_id')
    .eq('id', user.id)
    .single();

  const profile = profileData as { id: string; role: string; branch_id: string | null } | null;
  const role = profile?.role as UserRole | undefined;
  if (role !== 'SERVICE_MANAGER' && role !== 'OFFICE' && role !== 'CEO') {
    return { error: 'אין הרשאה ליצירת תיק' };
  }

  const branchId = input.branch_id;

  let carId: string;
  const { data: existingCar } = await supabase
    .from('cars')
    .select('id, first_registration_date')
    .eq('branch_id', branchId)
    .eq('license_plate', input.plate_number)
    .maybeSingle();

  if (existingCar) {
    carId = (existingCar as { id: string }).id;
    await supabase
      .from('cars')
      .update({
        ...(firstRegDate != null ? { first_registration_date: firstRegDate } : {}),
        ...(input.vehicle_type != null ? { vehicle_type: input.vehicle_type } : {}),
        ...(input.vehicle_year != null ? { year: input.vehicle_year } : {}),
      } as never)
      .eq('id', carId);
  } else {
    const { data: newCar, error: carErr } = await supabase
      .from('cars')
      .insert({
        branch_id: branchId,
        license_plate: input.plate_number,
        ...(firstRegDate != null ? { first_registration_date: firstRegDate } : {}),
        ...(input.vehicle_type != null ? { vehicle_type: input.vehicle_type } : {}),
        ...(input.vehicle_year != null ? { year: input.vehicle_year } : {}),
      } as never)
      .select('id')
      .single();
    if (carErr || !newCar) return { error: carErr?.message ?? 'שגיאה ביצירת רכב' };
    carId = (newCar as { id: string }).id;
  }

  const caseKey = `${input.plate_number}-${input.claim_number ?? 'PRIVATE'}`;
  const openedAt = new Date().toISOString();

  const { data: newCase, error: caseErr } = await supabase
    .from('cases')
    .insert({
      branch_id: branchId,
      car_id: carId,
      case_key: caseKey,
      claim_number: input.claim_number ?? null,
      insurance_type: input.insurance_type ?? null,
      claim_type: input.claim_type ?? null,
      opened_at: openedAt,
      created_by: user.id,
      // New fields (migration 006) — only send if not null to avoid schema cache errors
      ...(input.sub_claim_type != null ? { sub_claim_type: input.sub_claim_type } : {}),
      ...(input.customer_name != null ? { customer_name: input.customer_name } : {}),
      ...(input.phone != null ? { phone: input.phone } : {}),
      ...(input.insurance_company != null ? { insurance_company: input.insurance_company } : {}),
      ...(input.appraiser_name != null ? { appraiser_name: input.appraiser_name } : {}),
      ...(input.event_date != null ? { event_date: input.event_date } : {}),
    } as never)
    .select('id')
    .single();

  if (caseErr || !newCase) return { error: caseErr?.message ?? 'שגיאה ביצירת תיק' };
  const caseId = (newCase as { id: string }).id;
  if (!caseId) return { error: 'לא התקבל מזהה תיק' };

  const { data: run, error: runErr } = await supabase
    .from('case_workflow_runs')
    .insert({
      case_id: caseId,
      workflow_type: 'PROFESSIONAL',
      status: 'ACTIVE',
    } as never)
    .select('id')
    .single();

  if (runErr || !run) return { error: runErr?.message ?? 'שגיאה ביצירת workflow' };
  const runId = (run as { id: string }).id;

  const ageFromDate = vehicleAgeYears(firstRegDate);
  // Fallback: use vehicle_year if no first_registration_date provided
  const ageFromYear = input.vehicle_year
    ? (new Date().getFullYear() - input.vehicle_year)
    : null;
  const age = ageFromDate ?? ageFromYear;
  const skipWheels = age !== null && age <= 2;

  // Load step templates from DB; fallback to hardcoded array
  let stepsToCreate: { step_key: string; order_index: number }[] = [];
  const { data: templateData } = await supabase
    .from('workflow_step_templates')
    .select('step_key, order_index')
    .eq('is_enabled', true)
    .order('order_index');
  if (templateData && templateData.length > 0) {
    stepsToCreate = templateData as { step_key: string; order_index: number }[];
  } else {
    stepsToCreate = PROFESSIONAL_WORKFLOW_STEPS.map((sk, i) => ({ step_key: sk, order_index: i }));
  }

  for (const { step_key: stepKey, order_index } of stepsToCreate) {
    let state: 'PENDING' | 'ACTIVE' | 'DONE' | 'SKIPPED' = 'ACTIVE';
    let completedAt: string | null = null;
    let activatedAt: string | null = openedAt;

    if (stepKey === 'OPEN_CASE') {
      state = 'DONE';
      completedAt = openedAt;
      activatedAt = openedAt;
    } else if (stepKey === 'WHEELS_CHECK' && skipWheels) {
      state = 'SKIPPED';
      completedAt = openedAt;
      activatedAt = null;
    } else {
      state = 'ACTIVE';
      activatedAt = openedAt;
      completedAt = null;
    }

    await supabase.from('case_workflow_steps').insert({
      run_id: runId,
      step_key: stepKey,
      state,
      order_index,
      activated_at: activatedAt,
      completed_at: completedAt,
    } as never);
  }

  revalidatePath('/cases');
  await writeAudit(supabase, 'CASE', caseId, 'CASE_CREATED', user.id, { case_key: caseKey });
  await writeAudit(supabase, 'WORKFLOW_STEP', runId, 'STEP_ACTIVATED', user.id, {
    step_key: 'FIXCAR_PHOTOS',
  });
  if (skipWheels) {
    const { data: wheelsStepData } = await supabase
      .from('case_workflow_steps')
      .select('id')
      .eq('run_id', runId)
      .eq('step_key', 'WHEELS_CHECK')
      .single();
    if (wheelsStepData)
      await writeAudit(supabase, 'WORKFLOW_STEP', (wheelsStepData as { id: string }).id, 'STEP_SKIPPED', user.id, {
        reason: 'vehicle_age_under_2',
      });
  }

  return { caseId: String(caseId) };
}

export async function completeActiveStep(caseId: string, stepId?: string) {
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
  const role = profile?.role as UserRole | undefined;

  const { data: caseData } = await supabase
    .from('cases')
    .select('id, fixcar_link, parts_status')
    .eq('id', caseId)
    .single();
  if (!caseData) return { error: 'תיק לא נמצא' };
  const caseRow = caseData as { id: string; fixcar_link: string | null; parts_status: string | null };

  const { data: runData } = await supabase
    .from('case_workflow_runs')
    .select('id, workflow_type')
    .eq('case_id', caseId)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (!runData) return { error: 'לא נמצא workflow פעיל' };
  const run = runData as { id: string; workflow_type: string };

  const isClosure = run.workflow_type === 'CLOSURE';
  if (isClosure && role !== 'OFFICE' && role !== 'CEO') return { error: 'רק משרד יכול להשלים שלבי סגירה' };
  if (!isClosure && role !== 'SERVICE_MANAGER' && role !== 'CEO') return { error: 'רק מנהל שירות יכול להשלים שלב' };

  let activeStep: { id: string; step_key: string; order_index: number } | null = null;

  if (stepId) {
    const { data: stepData } = await supabase
      .from('case_workflow_steps')
      .select('id, step_key, order_index, state')
      .eq('id', stepId)
      .eq('run_id', run.id)
      .single();
    if (!stepData) return { error: 'שלב לא נמצא' };
    const step = stepData as { id: string; step_key: string; order_index: number; state: string };
    if (step.state !== 'ACTIVE' && step.state !== 'PENDING') {
      return { error: 'שלב זה כבר הושלם או דולג' };
    }
    activeStep = step;
  } else {
    const { data: activeSteps } = await supabase
      .from('case_workflow_steps')
      .select('id, step_key, order_index')
      .eq('run_id', run.id)
      .eq('state', 'ACTIVE')
      .order('order_index', { ascending: true })
      .limit(1);
    const firstStep = activeSteps && activeSteps.length > 0
      ? (activeSteps[0] as { id: string; step_key: string; order_index: number })
      : null;
    activeStep = firstStep;
    if (!activeStep) return { error: 'אין שלב פעיל להשלמה' };
  }

  const stepKey = activeStep.step_key;

  // FIXCAR_PHOTOS: קישור אופציונלי — לא חוסם התקדמות
  // (הוסר חסם ב-013)

  if (stepKey === 'ENTER_WORK' && caseRow.parts_status !== 'AVAILABLE') {
    await writeAudit(supabase, 'WORKFLOW_STEP', activeStep.id, 'STEP_COMPLETED_WITH_WARNING', user.id, {
      reason: 'parts_not_available',
      message: 'שלב הושלם למרות שחלקים לא זמינים',
    });
  }

  if (stepKey === 'READY_FOR_OFFICE' || stepKey === 'CLOSE_CASE') {
    const { data: extras } = await supabase
      .from('bodywork_extras')
      .select('id')
      .eq('case_id', caseId)
      .eq('status', 'IN_TREATMENT');
    if (extras && extras.length > 0) {
      await supabase.from('notifications').insert({
        user_id: profile!.id,
        case_id: caseId,
        type: 'BLOCKED_ACTION',
        title: 'פעולה חסומה',
        body: 'קיימות תוספות בטיפול',
        action_url: `/cases/${caseId}`,
      } as never);
      await writeAudit(supabase, 'WORKFLOW_STEP', activeStep.id, 'BLOCKED_ACTION', user.id, {
        reason: 'extras_in_treatment',
      });
      return { error: 'יש תוספות בטיפול' };
    }

    // CLOSE_CASE no longer requires a separate CASE_CLOSURE approval (Session 6).
    // ESTIMATE_AND_DETAILS approval (already given mid-workflow) is the single CEO sign-off.
    if (stepKey === 'CLOSE_CASE') {
      // No further approval gate — proceed to closure logic below.
    } else {
      // READY_FOR_OFFICE: gate on ESTIMATE_AND_DETAILS (and WHEELS_CHECK if relevant).
      const { data: approvals } = await supabase
        .from('ceo_approvals')
        .select('approval_type, status, created_at')
        .eq('case_id', caseId);
      const approvalsArr = (approvals ?? []) as { approval_type: string; status: string; created_at: string }[];
      const latest = latestApprovalsByType(approvalsArr);
      const estimateApproval = latest.get('ESTIMATE_AND_DETAILS') ?? null;
      const wheelsApproval = latest.get('WHEELS_CHECK') ?? null;
      const { data: wheelsStep } = await supabase
        .from('case_workflow_steps')
        .select('id')
        .eq('run_id', run.id)
        .eq('step_key', 'WHEELS_CHECK')
        .eq('state', 'DONE')
        .maybeSingle();
      const needsWheelsApproval = !!(wheelsStep as { id: string } | null)?.id;

      // Ensure approvals exist (so case appears on the approvals screen).
      if (!estimateApproval) {
        await supabase.from('ceo_approvals').insert({
          case_id: caseId,
          approval_type: 'ESTIMATE_AND_DETAILS',
          status: 'PENDING',
        } as never);
      }
      if (needsWheelsApproval && !wheelsApproval) {
        await supabase.from('ceo_approvals').insert({
          case_id: caseId,
          approval_type: 'WHEELS_CHECK',
          status: 'PENDING',
        } as never);
      }

      if (!estimateApproval || estimateApproval.status !== 'APPROVED') {
        await supabase.from('notifications').insert({
          user_id: profile!.id,
          case_id: caseId,
          type: 'BLOCKED_ACTION',
          title: 'פעולה חסומה',
          body: 'חסר או נדחה אישור CEO לאומדן',
          action_url: `/approvals`,
        } as never);
        await writeAudit(supabase, 'WORKFLOW_STEP', activeStep.id, 'BLOCKED_ACTION', user.id, {
          reason: 'ceo_approval_missing_or_rejected',
        });
        return { error: 'נדרש אישור CEO לאומדן' };
      }
      if (needsWheelsApproval && (!wheelsApproval || wheelsApproval.status !== 'APPROVED')) {
        await supabase.from('notifications').insert({
          user_id: profile!.id,
          case_id: caseId,
          type: 'BLOCKED_ACTION',
          title: 'פעולה חסומה',
          body: 'חסר או נדחה אישור CEO לטפסי גלגלים',
          action_url: `/approvals`,
        } as never);
        await writeAudit(supabase, 'WORKFLOW_STEP', activeStep.id, 'BLOCKED_ACTION', user.id, {
          reason: 'ceo_approval_missing_or_rejected',
        });
        return { error: 'נדרש אישור CEO לטפסי גלגלים' };
      }
    }
  }

  // For steps that require CEO approval: ensure approval row(s) exist (so case appears in approvals screen).
  // We do NOT block completing the step — user can advance. Blocking is only at READY_FOR_OFFICE.
  {
    const { data: templateData } = await supabase
      .from('workflow_step_templates')
      .select('requires_ceo_approval')
      .eq('step_key', stepKey)
      .maybeSingle();
    const requiresApproval = (templateData as { requires_ceo_approval: boolean } | null)?.requires_ceo_approval ?? false;

    if (requiresApproval) {
      const approvalType = stepKey === 'WAIT_APPRAISER_APPROVAL' ? 'ESTIMATE_AND_DETAILS' : stepKey;
      const { data: existingApprovals } = await supabase
        .from('ceo_approvals')
        .select('approval_type, status, created_at')
        .eq('case_id', caseId);
      const approvalsArr = (existingApprovals ?? []) as { approval_type: string; status: string; created_at: string }[];
      const existing = latestApprovalsByType(approvalsArr).get(approvalType) ?? null;

      if (!existing) {
        await supabase.from('ceo_approvals').insert({
          case_id: caseId,
          approval_type: approvalType,
          status: 'PENDING',
        } as never);
        await notifyCeosPendingApproval(supabase, caseId, approvalType, user.id);
        if (stepKey === 'WAIT_APPRAISER_APPROVAL') {
          const typeKeys = new Set(Array.from(latestApprovalsByType(approvalsArr).keys()));
          const { data: wheelsStep } = await supabase
            .from('case_workflow_steps')
            .select('id')
            .eq('run_id', run.id)
            .eq('step_key', 'WHEELS_CHECK')
            .eq('state', 'DONE')
            .maybeSingle();
          if (wheelsStep && !typeKeys.has('WHEELS_CHECK')) {
            await supabase.from('ceo_approvals').insert({
              case_id: caseId,
              approval_type: 'WHEELS_CHECK',
              status: 'PENDING',
            } as never);
            await notifyCeosPendingApproval(supabase, caseId, 'WHEELS_CHECK', user.id);
          }
        }
      }
      // Allow step to be marked DONE — gating is only at READY_FOR_OFFICE.
    }
  }

  const now = new Date().toISOString();
  await supabase
    .from('case_workflow_steps')
    .update({
      state: 'DONE',
      completed_at: now,
      completed_by: user.id,
    } as never)
    .eq('id', activeStep.id);

  if (stepKey === 'READY_FOR_OFFICE') {
    await supabase
      .from('cases')
      .update({ treatment_finished_at: now } as never)
      .eq('id', caseId);

    // Fetch case info for notifications
    const { data: caseForNotif } = await supabase
      .from('cases')
      .select('case_key, branch_id, cars(license_plate)')
      .eq('id', caseId)
      .single();
    const caseNotif = caseForNotif as { case_key: string | null; branch_id: string; cars: { license_plate: string | null } | null } | null;
    const plateLabel = (Array.isArray(caseNotif?.cars) ? caseNotif?.cars[0]?.license_plate : caseNotif?.cars?.license_plate) ?? caseNotif?.case_key ?? 'תיק';

    // Notify all OFFICE users of the same branch
    const { data: officeUsers } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'OFFICE')
      .eq('branch_id', caseNotif?.branch_id ?? '');
    for (const ou of (officeUsers ?? []) as { id: string }[]) {
      await supabase.from('notifications').insert({
        user_id: ou.id,
        case_id: caseId,
        type: 'READY_FOR_OFFICE',
        title: 'תיק מוכן לסגירה',
        body: `רכב ${plateLabel} סיים טיפול ומוכן לתהליך סגירה`,
        action_url: `/closure/${caseId}`,
        triggered_by: user.id,
      } as never);
    }

    // Auto-start CLOSURE workflow if not already exists
    const { data: existingClosure } = await supabase
      .from('case_workflow_runs')
      .select('id')
      .eq('case_id', caseId)
      .eq('workflow_type', 'CLOSURE')
      .maybeSingle();

    if (!existingClosure) {
      const { data: newRunData } = await supabase
        .from('case_workflow_runs')
        .insert({ case_id: caseId, workflow_type: 'CLOSURE', status: 'ACTIVE' } as never)
        .select('id')
        .single();
      const newRun = newRunData as { id: string } | null;

      if (newRun) {
        const closureSteps = [
          { step_key: 'CLOSURE_VERIFY_DETAILS_DOCS', order_index: 0, state: 'ACTIVE' },
          { step_key: 'CLOSURE_PROFORMA_IF_NEEDED', order_index: 1, state: 'PENDING' },
          { step_key: 'CLOSURE_PREPARE_CLOSING_FORMS', order_index: 2, state: 'PENDING' },
          { step_key: 'CLOSE_CASE', order_index: 3, state: 'PENDING' },
        ];
        await supabase.from('case_workflow_steps').insert(
          closureSteps.map((s) => ({ ...s, run_id: newRun.id, activated_at: s.state === 'ACTIVE' ? now : null })) as never
        );
      }
    }
  }

  // WASH step: notify SERVICE_MANAGER + SERVICE_ADVISOR (bodywork advisors) to start QC process
  if (stepKey === 'WASH') {
    const { data: washCaseData } = await supabase
      .from('cases')
      .select('case_key, branch_id, cars(license_plate)')
      .eq('id', caseId)
      .single();
    const washCase = washCaseData as { case_key: string | null; branch_id: string; cars: { license_plate: string | null } | null } | null;
    const washPlate = (Array.isArray(washCase?.cars) ? washCase?.cars[0]?.license_plate : washCase?.cars?.license_plate) ?? washCase?.case_key ?? 'תיק';

    const { data: advisors } = await supabase
      .from('profiles')
      .select('id')
      .eq('branch_id', washCase?.branch_id ?? '')
      .eq('is_bodywork_advisor', true);
    for (const adv of (advisors ?? []) as { id: string }[]) {
      await supabase.from('notifications').insert({
        user_id: adv.id,
        case_id: caseId,
        type: 'WASH_STARTED',
        title: 'רכב נשלח לשטיפה',
        body: `רכב ${washPlate} נשלח לשטיפה — התחל תהליך בקרת איכות, טפל בניירת והעבר לאילנה`,
        action_url: `/cases/${caseId}`,
        triggered_by: user.id,
      } as never);
    }
  }

  // CLOSURE_PREPARE_CLOSING_FORMS used to create a CASE_CLOSURE approval (Session 5).
  // Removed in Session 6 — Amit's ESTIMATE_AND_DETAILS approval is the sole CEO sign-off.

  if (stepKey === 'CLOSE_CASE') {
    await supabase.from('cases').update({ closed_at: now, general_status: 'COMPLETED' } as never).eq('id', caseId);
    await supabase.from('case_workflow_runs').update({ status: 'COMPLETED' } as never).eq('id', run.id);
    await writeAudit(supabase, 'CASE', caseId, 'CASE_CLOSED', user.id);
  }

  const nextOrder = activeStep.order_index + 1;
  const { data: nextSteps } = await supabase
    .from('case_workflow_steps')
    .select('id, state')
    .eq('run_id', run.id)
    .eq('order_index', nextOrder)
    .limit(1);
  if (nextSteps && nextSteps.length > 0) {
    const nextStep = nextSteps[0] as { id: string; state: string };
    // Only activate if not already SKIPPED (e.g. WHEELS_CHECK auto-skipped for young cars)
    if (nextStep.state !== 'SKIPPED') {
      await supabase
        .from('case_workflow_steps')
        .update({ state: 'ACTIVE', activated_at: now } as never)
        .eq('id', nextStep.id);
    }
  } else if (run.workflow_type === 'PROFESSIONAL') {
    await supabase.from('case_workflow_runs').update({ status: 'COMPLETED' } as never).eq('id', run.id);
  }

  await writeAudit(supabase, 'WORKFLOW_STEP', activeStep.id, 'STEP_COMPLETED', user.id, {
    step_key: stepKey,
  });

  // Only revalidate the list — the case detail page uses client-side reloadStepsFromDB()
  // which avoids the RSC push flicker caused by revalidating the current route
  revalidatePath('/cases');
  return { ok: true, error: null };
}

export async function returnToEstimate(caseId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  const { data: profileData } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const profile = profileData as { role: string } | null;
  if (profile?.role !== 'SERVICE_MANAGER' && profile?.role !== 'CEO') return { error: 'רק מנהל שירות יכול להחזיר לאומדן' };

  const { data: runData } = await supabase
    .from('case_workflow_runs')
    .select('id')
    .eq('case_id', caseId)
    .eq('workflow_type', 'PROFESSIONAL')
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (!runData) return { error: 'לא נמצא workflow מקצועי פעיל' };
  const run = runData as { id: string };

  const { data: prepStepData } = await supabase
    .from('case_workflow_steps')
    .select('id')
    .eq('run_id', run.id)
    .eq('step_key', 'PREP_ESTIMATE')
    .single();
  if (!prepStepData) return { error: 'שלב אומדן לא נמצא' };
  const prepStepId = (prepStepData as { id: string }).id;

  await supabase
    .from('case_workflow_steps')
    .update({ state: 'PENDING' } as never)
    .eq('run_id', run.id)
    .eq('state', 'ACTIVE');
  const now = new Date().toISOString();
  await supabase
    .from('case_workflow_steps')
    .update({ state: 'ACTIVE', activated_at: now } as never)
    .eq('id', prepStepId);

  await writeAudit(supabase, 'WORKFLOW_STEP', prepStepId, 'RETURNED_TO_ESTIMATE', user.id);
  return { ok: true };
}

export async function deleteCase(caseId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  const { data: profileData } = await supabase.from('profiles').select('id, role').eq('id', user.id).single();
  const profile = profileData as { id: string; role: string } | null;
  if (profile?.role !== 'CEO') return { error: 'רק CEO יכול למחוק תיקים' };

  // Soft delete — mark deleted_at and deleted_by
  await supabase
    .from('cases')
    .update({ deleted_at: new Date().toISOString(), deleted_by: profile.id } as never)
    .eq('id', caseId);

  await writeAudit(supabase, 'CASE', caseId, 'CASE_DELETED', user.id);
  revalidatePath('/cases');
  revalidatePath('/cases/archive');
  return { ok: true, error: null };
}

export async function restoreCase(caseId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  const { data: profileData } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const profile = profileData as { role: string } | null;
  if (profile?.role !== 'CEO') return { error: 'רק CEO יכול לשחזר תיקים' };

  await supabase
    .from('cases')
    .update({ deleted_at: null, deleted_by: null } as never)
    .eq('id', caseId);

  await writeAudit(supabase, 'CASE', caseId, 'CASE_RESTORED', user.id);
  revalidatePath('/cases');
  revalidatePath('/cases/archive');
  return { ok: true, error: null };
}
