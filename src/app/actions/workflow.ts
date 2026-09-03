'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { sendPushToUser, pushToOverseers, notifyRelevantParties } from '@/app/actions/push';
import { branchRecipients } from '@/lib/recipients';
import {
  PROFESSIONAL_WORKFLOW_STEPS,
  APPROVAL_NOTIFICATION_TYPE_LABELS as APPROVAL_TYPE_LABELS,
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

// Notify all CEOs that a new approval is pending for them. `approvalId`
// (the ceo_approvals row) is threaded into the URL so the click lands
// scrolled-to and highlighted on that exact approval, not just "somewhere
// on the approvals screen" — with several pending, that was the actual
// complaint (see NotificationsBell.tsx's per-case-url comment).
async function notifyCeosPendingApproval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  caseId: string,
  approvalType: string,
  triggeredBy: string,
  approvalId: string
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
  const title = `אישור ${label} ממתין`;
  const body = `רכב ${plate} ממתין לאישורך`;
  const url = `/approvals?highlight=${approvalId}`;
  // Sequential, not Promise.all: concurrent inserts race the DB fan-out
  // trigger's (031/032) 10-second de-dup check against each other, so
  // several of these can all pass the "not already sent" check before any
  // of their fan-out copies commit — producing real duplicate notifications
  // to CEOs/cross-branch advisors. Real incident, not theoretical: the first
  // live run of a similar loop in the escalation cron (added later) sent
  // some overseers 3-4 copies of the same notification. These lists are
  // small (a handful of staff), so serializing costs nothing that matters.
  for (const ceo of (ceos ?? []) as { id: string }[]) {
    const { error: notifErr } = await supabase.from('notifications').insert({
      user_id: ceo.id,
      case_id: caseId,
      type: 'PENDING_APPROVAL',
      title,
      body,
      action_url: url,
      triggered_by: triggeredBy,
    } as never);
    if (notifErr) console.error('[notifications] insert failed', notifErr);
    await sendPushToUser(ceo.id, { title, body, url, tag: `approval-${caseId}` });
  }
  // CEO-only notification for approvals pending (audit trail)
  await notifyRelevantParties('PENDING_APPROVAL', null, { title, body, url, tag: `approval-${caseId}` }, triggeredBy);
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
    .select('id, role, branch_ids')
    .eq('id', user.id)
    .single();

  const profile = profileData as { id: string; role: string; branch_ids: string[] } | null;
  const role = profile?.role as UserRole | undefined;
  if (role !== 'SERVICE_MANAGER' && role !== 'OFFICE' && role !== 'CEO' && role !== 'SERVICE_ADVISOR') {
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
      ...(input.sub_claim_type_other_text != null ? { sub_claim_type_other_text: input.sub_claim_type_other_text } : {}),
      ...(input.customer_name != null ? { customer_name: input.customer_name } : {}),
      ...(input.phone != null ? { phone: input.phone } : {}),
      ...(input.insurance_company != null ? { insurance_company: input.insurance_company } : {}),
      ...(input.appraiser_name != null ? { appraiser_name: input.appraiser_name } : {}),
      ...(input.event_date != null ? { event_date: input.event_date } : {}),
    } as never)
    .select('id')
    .single();

  if (caseErr || !newCase) {
    // Unique violation on (branch_id, case_key): a case for this plate+claim
    // already exists in this branch. Return a clear message so the user opens
    // the existing case instead of retrying in another branch (which created
    // duplicate cases across branches).
    if ((caseErr as { code?: string } | null)?.code === '23505') {
      return { error: 'כבר קיים תיק פתוח לרכב הזה בסניף שבחרת. חפש אותו ברשימת התיקים במקום לפתוח חדש.' };
    }
    return { error: caseErr?.message ?? 'שגיאה ביצירת תיק' };
  }
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

  const firstActiveOrder = stepsToCreate
    .filter(({ step_key: stepKey }) => stepKey !== 'OPEN_CASE' && !(stepKey === 'WHEELS_CHECK' && skipWheels))
    .sort((a, b) => a.order_index - b.order_index)[0]?.order_index ?? null;

  // Each row is independent (no cross-step dependency at insert time — the
  // ordering is carried in order_index, not insertion order), so this is one
  // batch insert instead of N round-trips to build a single new case's steps.
  const stepRows = stepsToCreate.map(({ step_key: stepKey, order_index }) => {
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
    } else if (order_index === firstActiveOrder) {
      state = 'ACTIVE';
      activatedAt = openedAt;
      completedAt = null;
    } else {
      state = 'PENDING';
      activatedAt = null;
      completedAt = null;
    }

    return {
      run_id: runId,
      step_key: stepKey,
      state,
      order_index,
      activated_at: activatedAt,
      completed_at: completedAt,
    };
  });

  const { error: stepsErr } = await supabase.from('case_workflow_steps').insert(stepRows as never);
  if (stepsErr) console.error('[createCase] workflow step insert failed', stepsErr);

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

  // Notify branch staff that a new case was opened. Everyone in the branch who
  // touches cases gets a heads-up so the whole team is aware from minute zero.
  // Excludes the creator (no point notifying yourself).
  {
    const customerLabel = input.customer_name?.trim() || input.plate_number;
    const title = 'תיק חדש נפתח';
    const body = `${customerLabel} · ${input.plate_number}`;
    // Requested: painters should know a new case exists too — they're the
    // ones who'll actually work on the car. `/go/${caseId}` (not
    // `/cases/${caseId}` directly) is the role-neutral deep link — it
    // forwards a painter to /painters/{id} and everyone else to /cases/{id}
    // (see src/app/go/[id]/page.tsx), so one action_url works for every role.
    const branchStaff = (await branchRecipients(supabase, branchId))
      .filter((p) => p.role === 'SERVICE_MANAGER' || p.role === 'SERVICE_ADVISOR' || p.role === 'OFFICE' || p.role === 'PAINTER');
    // Sequential — see the comment on the identical pattern in
    // notifyCeosPendingApproval above (race against the DB fan-out trigger).
    for (const staff of branchStaff.filter((s) => s.id !== user.id)) {
      const { error: notifErr } = await supabase.from('notifications').insert({
        user_id: staff.id,
        case_id: caseId,
        type: 'OTHER',
        title,
        body,
        action_url: `/go/${caseId}`,
        triggered_by: user.id,
      } as never);
      if (notifErr) console.error('[notifications] insert failed', notifErr);
      await sendPushToUser(staff.id, { title, body, url: `/go/${caseId}`, tag: `new-case-${caseId}` });
    }
    // Notify SERVICE_MANAGER in branch + CEO for audit trail
    await notifyRelevantParties('NEW_CASE', branchId, { title, body, url: `/go/${caseId}`, tag: `new-case-${caseId}` }, user.id, branchStaff);
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
    .select('id, role, branch_id, sees_all_branches')
    .eq('id', user.id)
    .single();
  const profile = profileData as { id: string; role: string; branch_id: string | null; sees_all_branches?: boolean } | null;
  const role = profile?.role as UserRole | undefined;

  const { data: caseData } = await supabase
    .from('cases')
    .select('id, fixcar_link, parts_status, branch_id')
    .eq('id', caseId)
    .single();
  if (!caseData) return { error: 'תיק לא נמצא' };
  const caseRow = caseData as { id: string; fixcar_link: string | null; parts_status: string | null; branch_id: string };

  // Explicit branch check. RLS already prevents cross-branch writes, but
  // without this the action would silently no-op and return {ok:true} to a
  // manager acting on another branch's case. Fail loudly instead. CEO exempt.
  if (role !== 'CEO' && !profile?.sees_all_branches && profile?.branch_id !== caseRow.branch_id) {
    return { error: 'אין הרשאה לתיק זה (סניף אחר)' };
  }

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
  if (!isClosure && role !== 'SERVICE_MANAGER' && role !== 'CEO' && role !== 'SERVICE_ADVISOR') return { error: 'רק מנהל שירות או יועץ שירות יכול להשלים שלב' };

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

  // Gate the office handoff at SEND_COMPLETION_PHOTOS (the user's "ready for office" signal).
  // READY_FOR_OFFICE is kept as an auto-completed marker after this step.
  if (stepKey === 'SEND_COMPLETION_PHOTOS' || stepKey === 'READY_FOR_OFFICE' || stepKey === 'CLOSE_CASE') {
    const { data: extras } = await supabase
      .from('bodywork_extras')
      .select('id')
      .eq('case_id', caseId)
      .eq('status', 'IN_TREATMENT');
    if (extras && extras.length > 0) {
      const blockedTitle = 'פעולה חסומה';
      const blockedBody = 'קיימות תוספות בטיפול';
      // Highlight the step that's actually blocked so the recipient doesn't
      // have to scan the whole list to find it.
      const blockedUrl = `/cases/${caseId}?highlight=${stepKey}`;
      const { error: notifErr } = await supabase.from('notifications').insert({
        user_id: profile!.id,
        case_id: caseId,
        type: 'BLOCKED_ACTION',
        title: blockedTitle,
        body: blockedBody,
        action_url: blockedUrl,
        triggered_by: user.id,
      } as never);
      if (notifErr) console.error('[notifications] insert failed', notifErr);
      await sendPushToUser(profile!.id, { title: blockedTitle, body: blockedBody, url: blockedUrl, tag: `blocked-extras-${caseId}` });
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
      // SEND_COMPLETION_PHOTOS / READY_FOR_OFFICE: gate on ESTIMATE_AND_DETAILS only.
      // WHEELS_CHECK used to also require a CEO approval here — explicit request
      // removed that gate (2026-08-31): wheel forms only need a plain FYI
      // notification to the CEO, not a blocking sign-off. See the WHEELS_CHECK
      // completion notification below instead of a ceo_approvals row.
      const { data: approvals } = await supabase
        .from('ceo_approvals')
        .select('approval_type, status, created_at')
        .eq('case_id', caseId);
      const approvalsArr = (approvals ?? []) as { approval_type: string; status: string; created_at: string }[];
      const latest = latestApprovalsByType(approvalsArr);
      const estimateApproval = latest.get('ESTIMATE_AND_DETAILS') ?? null;

      // Ensure approval exists (so case appears on the approvals screen).
      if (!estimateApproval) {
        await supabase.from('ceo_approvals').insert({
          case_id: caseId,
          approval_type: 'ESTIMATE_AND_DETAILS',
          status: 'PENDING',
        } as never);
      }

      if (!estimateApproval || estimateApproval.status !== 'APPROVED') {
        const blockedTitle = 'פעולה חסומה';
        const blockedBody = 'חסר או נדחה אישור CEO לאומדן';
        const { error: notifErr } = await supabase.from('notifications').insert({
          user_id: profile!.id,
          case_id: caseId,
          type: 'BLOCKED_ACTION',
          title: blockedTitle,
          body: blockedBody,
          action_url: `/approvals`,
          triggered_by: user.id,
        } as never);
        if (notifErr) console.error('[notifications] insert failed', notifErr);
        await sendPushToUser(profile!.id, { title: blockedTitle, body: blockedBody, url: '/approvals', tag: `blocked-est-${caseId}` });
        await writeAudit(supabase, 'WORKFLOW_STEP', activeStep.id, 'BLOCKED_ACTION', user.id, {
          reason: 'ceo_approval_missing_or_rejected',
        });
        return { error: 'נדרש אישור CEO לאומדן' };
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

      // Create a new PENDING approval in two cases:
      // 1. No approval of this type exists yet
      // 2. The latest is REJECTED — allow re-submission with a fresh row (keeps audit trail)
      const needsNewApproval = !existing || existing.status === 'REJECTED';
      if (needsNewApproval) {
        const { data: newApproval } = await supabase
          .from('ceo_approvals')
          .insert({
            case_id: caseId,
            approval_type: approvalType,
            status: 'PENDING',
          } as never)
          .select('id')
          .single();
        const newApprovalId = (newApproval as { id: string } | null)?.id;
        if (newApprovalId) await notifyCeosPendingApproval(supabase, caseId, approvalType, user.id, newApprovalId);
        // WHEELS_CHECK used to also get a ceo_approvals row created here — removed
        // 2026-08-31, see the READY_FOR_OFFICE gate above and the WHEELS_CHECK
        // completion notification below.
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

  // Office handoff: trigger at SEND_COMPLETION_PHOTOS (preferred) or READY_FOR_OFFICE (legacy).
  // After SEND_COMPLETION_PHOTOS: notify office + create closure run + auto-complete READY_FOR_OFFICE.
  const isOfficeHandoff = stepKey === 'SEND_COMPLETION_PHOTOS' || stepKey === 'READY_FOR_OFFICE';
  if (isOfficeHandoff) {
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
    const officeUsers = (await branchRecipients(supabase, caseNotif?.branch_id))
      .filter((p) => p.role === 'OFFICE');
    const officeTitle = 'תיק מוכן לסגירה';
    const officeBody = `רכב ${plateLabel} סיים טיפול ומוכן לתהליך סגירה`;
    // Sequential — see the comment on notifyCeosPendingApproval above.
    for (const ou of officeUsers) {
      const { error: notifErr } = await supabase.from('notifications').insert({
        user_id: ou.id,
        case_id: caseId,
        type: 'READY_FOR_OFFICE',
        title: officeTitle,
        body: officeBody,
        action_url: `/closure/${caseId}`,
        triggered_by: user.id,
      } as never);
      if (notifErr) console.error('[notifications] insert failed', notifErr);
      await sendPushToUser(ou.id, { title: officeTitle, body: officeBody, url: `/closure/${caseId}`, tag: `office-${caseId}` });
    }
    // Notify OFFICE staff + CEO for audit trail
    await notifyRelevantParties('READY_FOR_OFFICE', caseNotif?.branch_id, { title: officeTitle, body: officeBody, url: `/closure/${caseId}`, tag: `office-${caseId}` }, user.id, officeUsers as { id: string; role: string }[]);

    // Auto-start CLOSURE workflow if not already exists. The DB has a unique
    // index `uniq_case_workflow_runs_one_closure_per_case` so a concurrent
    // second completion will get a 23505 here instead of creating a duplicate.
    // We handle that case by reading the existing row.
    const { data: existingClosure } = await supabase
      .from('case_workflow_runs')
      .select('id')
      .eq('case_id', caseId)
      .eq('workflow_type', 'CLOSURE')
      .maybeSingle();

    if (!existingClosure) {
      const { data: newRunData, error: closureRunErr } = await supabase
        .from('case_workflow_runs')
        .insert({ case_id: caseId, workflow_type: 'CLOSURE', status: 'ACTIVE' } as never)
        .select('id')
        .single();

      // Unique-violation = another request just created the closure run — skip
      // step creation and let the other request own the seeding.
      const wasConflict = (closureRunErr as { code?: string } | null)?.code === '23505';
      const newRun = newRunData as { id: string } | null;

      if (newRun && !wasConflict) {
        const closureSteps = [
          { step_key: 'CLOSURE_VERIFY_DETAILS_DOCS', order_index: 0, state: 'ACTIVE' },
          { step_key: 'CLOSURE_PROFORMA_IF_NEEDED', order_index: 1, state: 'PENDING' },
          { step_key: 'CLOSURE_PREPARE_CLOSING_FORMS', order_index: 2, state: 'PENDING' },
          { step_key: 'CLOSE_CASE', order_index: 3, state: 'PENDING' },
        ];
        await supabase.from('case_workflow_steps').insert(
          closureSteps.map((s) => ({ ...s, run_id: newRun.id, activated_at: s.state === 'ACTIVE' ? now : null })) as never
        );
      } else if (closureRunErr && !wasConflict) {
        console.error('[completeActiveStep] failed to create closure run', closureRunErr);
      }
    }

    // If we got here from SEND_COMPLETION_PHOTOS, auto-complete READY_FOR_OFFICE so it
    // doesn't sit as a manual step delaying Ilana.
    if (stepKey === 'SEND_COMPLETION_PHOTOS') {
      const { data: rfoStep } = await supabase
        .from('case_workflow_steps')
        .select('id, state')
        .eq('run_id', run.id)
        .eq('step_key', 'READY_FOR_OFFICE')
        .maybeSingle();
      const rfo = rfoStep as { id: string; state: string } | null;
      if (rfo && rfo.state !== 'DONE' && rfo.state !== 'SKIPPED') {
        // Guard the write itself (not just the read above) so a duplicate
        // call — double-click, retry — can't both pass the read and both
        // log a completion event for the same step.
        const { data: updated } = await supabase
          .from('case_workflow_steps')
          .update({ state: 'DONE', completed_at: now, completed_by: user.id } as never)
          .eq('id', rfo.id)
          .neq('state', 'DONE')
          .neq('state', 'SKIPPED')
          .select('id');
        if (updated && updated.length > 0) {
          await writeAudit(supabase, 'WORKFLOW_STEP', rfo.id, 'STEP_COMPLETED', user.id, {
            step_key: 'READY_FOR_OFFICE',
            auto_completed: true,
            reason: 'auto_after_send_completion_photos',
          });
        }
      }
      // Mark professional run as completed
      await supabase.from('case_workflow_runs').update({ status: 'COMPLETED' } as never).eq('id', run.id);
    }
  }

  // ENTER_WORK: notify painters in the branch that there's a car waiting for them.
  if (stepKey === 'ENTER_WORK') {
    const { data: enterCaseData } = await supabase
      .from('cases')
      .select('case_key, branch_id, customer_name, cars(license_plate)')
      .eq('id', caseId)
      .single();
    const ew = enterCaseData as { case_key: string | null; branch_id: string; customer_name: string | null; cars: { license_plate: string | null } | null } | null;
    const ewPlate = (Array.isArray(ew?.cars) ? ew?.cars[0]?.license_plate : ew?.cars?.license_plate) ?? ew?.case_key ?? 'תיק';
    const ewCustomer = ew?.customer_name?.trim() || ewPlate;
    const ewBranchUsers = await branchRecipients(supabase, ew?.branch_id);
    let recipients = ewBranchUsers.filter((p) => p.role === 'PAINTER').map((p) => ({ id: p.id }));
    if (recipients.length === 0) {
      recipients = ewBranchUsers
        .filter((p) => p.role === 'SERVICE_MANAGER' || p.role === 'SERVICE_ADVISOR' || p.is_bodywork_advisor === true)
        .map((p) => ({ id: p.id }));
    }
    const ewTitle = 'רכב נכנס לעבודה';
    const ewBody = `${ewCustomer} · ${ewPlate} - מוכן עבורך`;
    // Sequential — see the comment on notifyCeosPendingApproval above.
    for (const p of recipients.filter((r) => r.id !== user.id)) {
      const { error: notifErr } = await supabase.from('notifications').insert({
        user_id: p.id,
        case_id: caseId,
        type: 'OTHER',
        title: ewTitle,
        body: ewBody,
        action_url: `/painters/${caseId}`,
        triggered_by: user.id,
      } as never);
      if (notifErr) console.error('[notifications] insert failed', notifErr);
      await sendPushToUser(p.id, { title: ewTitle, body: ewBody, url: `/painters/${caseId}`, tag: `enter-work-${caseId}` });
    }
    // Notify PAINTER + SERVICE_ADVISOR + CEO for audit trail
    await notifyRelevantParties('ENTER_WORK', ew?.branch_id, { title: ewTitle, body: ewBody, url: `/painters/${caseId}`, tag: `enter-work-${caseId}` }, user.id, ewBranchUsers);
  }

  // WHEELS_CHECK: FYI notification to the CEO only — explicit request (2026-08-31)
  // removed the old blocking ceo_approvals gate here (see the READY_FOR_OFFICE
  // gate above), Amit just wants to know it happened, not have to approve it.
  if (stepKey === 'WHEELS_CHECK') {
    const { data: wheelsCaseData } = await supabase
      .from('cases')
      .select('case_key, cars(license_plate)')
      .eq('id', caseId)
      .single();
    const wc = wheelsCaseData as { case_key: string | null; cars: { license_plate: string | null } | { license_plate: string | null }[] | null } | null;
    const wcPlate = (Array.isArray(wc?.cars) ? wc?.cars[0]?.license_plate : wc?.cars?.license_plate) ?? wc?.case_key ?? 'תיק';
    const { data: ceoRows } = await supabase.from('profiles').select('id').eq('role', 'CEO').eq('is_active', true);
    const wheelsTitle = 'טפסי גלגלים הושלמו';
    const wheelsBody = `רכב ${wcPlate} — טפסי גלגלים סומנו כהושלמו`;
    const wheelsUrl = `/go/${caseId}?highlight=WHEELS_CHECK`;
    // Sequential — see the comment on notifyCeosPendingApproval above.
    for (const ceo of ((ceoRows ?? []) as { id: string }[]).filter((r) => r.id !== user.id)) {
      const { error: notifErr } = await supabase.from('notifications').insert({
        user_id: ceo.id,
        case_id: caseId,
        type: 'OTHER',
        title: wheelsTitle,
        body: wheelsBody,
        action_url: wheelsUrl,
        triggered_by: user.id,
      } as never);
      if (notifErr) console.error('[notifications] insert failed', notifErr);
      await sendPushToUser(ceo.id, { title: wheelsTitle, body: wheelsBody, url: wheelsUrl, tag: `wheels-${caseId}` });
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

    const advisors = (await branchRecipients(supabase, washCase?.branch_id))
      .filter((p) => p.is_bodywork_advisor === true);
    const washTitle = 'רכב נשלח לשטיפה';
    const washBody = `רכב ${washPlate} נשלח לשטיפה - התחל תהליך בקרת איכות, טפל בניירת והעבר לאילנה`;
    // Body text points advisors straight at QUALITY_CONTROL — highlight it so
    // they land scrolled to the right step instead of scanning the list.
    const washUrl = `/cases/${caseId}?highlight=QUALITY_CONTROL`;
    // Sequential — see the comment on notifyCeosPendingApproval above.
    for (const adv of advisors) {
      const { error: notifErr } = await supabase.from('notifications').insert({
        user_id: adv.id,
        case_id: caseId,
        type: 'WASH_STARTED',
        title: washTitle,
        body: washBody,
        action_url: washUrl,
        triggered_by: user.id,
      } as never);
      if (notifErr) console.error('[notifications] insert failed', notifErr);
      await sendPushToUser(adv.id, { title: washTitle, body: washBody, url: washUrl, tag: `wash-${caseId}` });
    }
    // Notify SERVICE_ADVISOR + CEO for audit trail
    await notifyRelevantParties('WASH_COMPLETE', washCase?.branch_id, { title: washTitle, body: washBody, url: washUrl, tag: `wash-${caseId}` }, user.id, advisors as { id: string; role: string }[]);
  }

  // CLOSURE_PREPARE_CLOSING_FORMS used to create a CASE_CLOSURE approval (Session 5).
  // Removed in Session 6 — Amit's ESTIMATE_AND_DETAILS approval is the sole CEO sign-off.

  if (stepKey === 'CLOSE_CASE') {
    await supabase.from('cases').update({ closed_at: now, general_status: 'COMPLETED' } as never).eq('id', caseId);
    await supabase.from('case_workflow_runs').update({ status: 'COMPLETED' } as never).eq('id', run.id);
    await writeAudit(supabase, 'CASE', caseId, 'CASE_CLOSED', user.id);

    // Notify on final closure: the case's branch management (service managers +
    // office) and every CEO. CEOs are included explicitly here so they also get a
    // push (the in-app fan-out trigger covers in-app only). The actor is skipped.
    const { data: closeCaseData } = await supabase
      .from('cases')
      .select('case_key, branch_id, customer_name, cars(license_plate)')
      .eq('id', caseId)
      .single();
    const cc = closeCaseData as { case_key: string | null; branch_id: string | null; customer_name: string | null; cars: { license_plate: string | null } | { license_plate: string | null }[] | null } | null;
    const ccPlate = (Array.isArray(cc?.cars) ? cc?.cars[0]?.license_plate : cc?.cars?.license_plate) ?? cc?.case_key ?? 'תיק';
    const { data: ceoRows } = await supabase
      .from('profiles').select('id').eq('role', 'CEO').eq('is_active', true);
    const branchMgmt = (await branchRecipients(supabase, cc?.branch_id))
      .filter((p) => p.role === 'SERVICE_MANAGER' || p.role === 'OFFICE');
    const closeRecipients = new Set<string>([
      ...((ceoRows ?? []) as { id: string }[]).map((r) => r.id),
      ...branchMgmt.map((r) => r.id),
    ]);
    closeRecipients.delete(user.id);
    const closeTitle = 'תיק נסגר';
    const closeBody = `התיק של ${cc?.customer_name ?? ''} (רכב ${ccPlate}) נסגר סופית`.replace('  ', ' ');
    // Sequential — see the comment on notifyCeosPendingApproval above.
    for (const rid of Array.from(closeRecipients)) {
      const { error: notifErr } = await supabase.from('notifications').insert({
        user_id: rid,
        case_id: caseId,
        type: 'CASE_CLOSED',
        title: closeTitle,
        body: closeBody,
        action_url: `/cases/${caseId}`,
        triggered_by: user.id,
      } as never);
      if (notifErr) console.error('[notifications] insert failed', notifErr);
      await sendPushToUser(rid, { title: closeTitle, body: closeBody, url: `/cases/${caseId}`, tag: `closed-${caseId}` });
    }
    // Notify OFFICE + SERVICE_MANAGER + CEO for audit trail
    const allBranchMgmt = branchMgmt as { id: string; role: string }[];
    await notifyRelevantParties('CASE_CLOSED', cc?.branch_id, { title: closeTitle, body: closeBody, url: `/cases/${caseId}`, tag: `closed-${caseId}` }, user.id, allBranchMgmt);
  }

  // SEND_COMPLETION_PHOTOS already auto-completed READY_FOR_OFFICE and closed the
  // professional run. Skip the default next-step activation so we don't resurrect it.
  if (stepKey !== 'SEND_COMPLETION_PHOTOS') {
    const { data: nextSteps } = await supabase
      .from('case_workflow_steps')
      .select('id, state')
      .eq('run_id', run.id)
      .gt('order_index', activeStep.order_index)
      .not('state', 'in', '(DONE,SKIPPED)')
      .order('order_index', { ascending: true })
      .limit(1);
    if (nextSteps && nextSteps.length > 0) {
      const nextStep = nextSteps[0] as { id: string; state: string };
      // Only activate if not already SKIPPED (e.g. WHEELS_CHECK auto-skipped for young cars)
      // and not already DONE (e.g. READY_FOR_OFFICE auto-completed by us)
      if (nextStep.state !== 'SKIPPED' && nextStep.state !== 'DONE') {
        await supabase
          .from('case_workflow_steps')
          .update({ state: 'ACTIVE', activated_at: now } as never)
          .eq('id', nextStep.id);
      }
    } else if (run.workflow_type === 'PROFESSIONAL') {
      await supabase.from('case_workflow_runs').update({ status: 'COMPLETED' } as never).eq('id', run.id);
    }
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
