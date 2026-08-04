import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import type { PartsStatus, GeneralStatus } from '@/types/database';
import { PROFESSIONAL_WORKFLOW_STEPS } from '@/types/database';
import { CaseDetailClientV2 } from './CaseDetailClientV2';

type StepTemplate = {
  step_key: string;
  step_label: string;
  order_index: number;
  requires_link: boolean;
  requires_file_or_link: boolean;
  requires_ceo_approval?: boolean;
};

// ── Skeleton shown while heavy data loads ─────────────────────────────────────

function CaseDetailSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-100 h-96" />
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 h-96" />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 h-48" />
    </div>
  );
}

// ── Heavy data component (streams in) ─────────────────────────────────────────

type CaseRowMinimal = {
  id: string;
  branch_id: string;
  case_key: string | null;
  claim_number: string | null;
  fixcar_link: string | null;
  wheels_check_link: string | null;
  parts_status: string;
  opened_at: string | null;
  treatment_finished_at: string | null;
  closed_at: string | null;
  general_status: string;
  customer_name: string | null;
  phone: string | null;
  insurance_company: string | null;
  appraiser_name: string | null;
  event_date: string | null;
  sub_claim_type: string | null;
  insurance_type: string | null;
  claim_type: string | null;
  // Added migration 013
  notes?: string | null;
  parts_ordered?: boolean | null;
  parts_arrived?: boolean | null;
  qc_assignee?: string | null;
  estimate_link?: string | null;
  painter_status?: string | null;
  appraiser_status?: string | null;
  // Added migration 020 (Session 6)
  enter_work_checklist_state?: string[] | null;
  catalog_numbers_assignee?: string | null;
  parts_discounts_assignee?: string | null;
  completion_photos_assignee?: string | null;
  cars:
    | { license_plate: string; first_registration_date: string | null; vehicle_type?: string | null; year?: number | null; make?: string | null; model?: string | null; vin?: string | null }
    | { license_plate: string; first_registration_date: string | null; vehicle_type?: string | null; year?: number | null; make?: string | null; model?: string | null; vin?: string | null }[]
    | null;
  branches: { name: string } | { name: string }[] | null;
};

async function CaseDetailData({
  id,
  profile,
  caseRow,
}: {
  id: string;
  profile: { role: string; branch_id: string | null } | null;
  caseRow: CaseRowMinimal;
}) {
  const supabase = await createClient();

  // CRITICAL FIX: Load steps by case_id (through all runs) to find steps even if run_id changes.
  // Load templates in parallel — used only if we need to seed steps, but cheap enough to fetch
  // alongside runs to avoid a second sequential round-trip when seeding is required.
  const [{ data: allRuns }, { data: stepTemplatesData }] = await Promise.all([
    supabase
      .from('case_workflow_runs')
      .select('id, status')
      .eq('case_id', id)
      .eq('workflow_type', 'PROFESSIONAL'),
    supabase
      .from('workflow_step_templates')
      .select('step_key, step_label, order_index, requires_link, requires_file_or_link, requires_ceo_approval')
      .eq('is_enabled', true)
      .order('order_index'),
  ]);
  const stepTemplates: StepTemplate[] = (stepTemplatesData ?? []) as StepTemplate[];

  let steps: { id: string; step_key: string; state: string; order_index: number; completed_at?: string | null; completed_by?: string | null }[] = [];

  if (allRuns && allRuns.length > 0) {
    const runIds = allRuns.map((r) => (r as { id: string }).id);
    const { data: stepsData } = await supabase
      .from('case_workflow_steps')
      .select('id, step_key, state, order_index, completed_at, completed_by')
      .in('run_id', runIds)
      .order('order_index');
    steps = stepsData ?? [];
  }

  // Derive active run from allRuns (avoids a separate DB round-trip)
  const activeRunEntry = (allRuns ?? []).find(
    (r) => (r as { id: string; status: string }).status === 'ACTIVE'
  ) as { id: string; status: string } | undefined;
  const run = activeRunEntry ? { id: activeRunEntry.id } : null;

  // In PREVIEW mode, use the first run we found (don't create a new one)
  let actualRun = run;
  if (process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true') {
    if (!run && allRuns && allRuns.length > 0) {
      actualRun = { id: (allRuns[0] as { id: string }).id };
    } else if (!run) {
      const { data: newRunData } = await supabase
        .from('case_workflow_runs')
        .insert({
          case_id: id,
          workflow_type: 'PROFESSIONAL',
          status: 'ACTIVE',
        } as never)
        .select('id')
        .single();
      if (newRunData) {
        actualRun = newRunData as { id: string };
      }
    }
  }

  // If we still have no steps but have a run, try loading by run_id
  if (actualRun && steps.length === 0) {
    const { data: stepsData } = await supabase
      .from('case_workflow_steps')
      .select('id, step_key, state, order_index, completed_at, completed_by')
      .eq('run_id', actualRun.id)
      .order('order_index');
    steps = stepsData ?? [];

    // If we have a run but no steps, create them from templates
    if (steps.length === 0) {
      const stepsToCreate = stepTemplates.length > 0
        ? stepTemplates
        : PROFESSIONAL_WORKFLOW_STEPS.map((sk, i) => ({ step_key: sk, step_label: sk, order_index: i, requires_link: false, requires_file_or_link: false, requires_ceo_approval: false }));

      const openedAt = caseRow.opened_at || new Date().toISOString();
      const carData = Array.isArray(caseRow.cars)
        ? caseRow.cars[0]
        : caseRow.cars;
      const firstReg = carData?.first_registration_date ?? null;
      const age = firstReg ? (Date.now() - new Date(firstReg).getTime()) / (365.25 * 24 * 60 * 60 * 1000) : null;
      const skipWheels = age !== null && age <= 2;

      for (const { step_key: stepKey, order_index: orderIndex } of stepsToCreate) {
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
          run_id: actualRun.id,
          step_key: stepKey,
          state,
          order_index: orderIndex,
          activated_at: activatedAt,
          completed_at: completedAt,
        } as never);
      }

      const { data: newStepsData } = await supabase
        .from('case_workflow_steps')
        .select('id, step_key, state, order_index, completed_at, completed_by')
        .eq('run_id', actualRun.id)
        .order('order_index');
      steps = newStepsData ?? [];
    }
  }

  // Parallelise independent queries
  const stepIds = steps.map((s) => s.id);
  type AuditRow = { id: string; action: string; user_id: string | null; created_at: string; payload: unknown };
  type AuditResult = { data: AuditRow[] | null };

  const [
    { data: approvals },
    { data: extras },
    { data: caseAudit },
    { data: documentsData },
    stepAuditResult,
    { data: advisorsData },
  ] = await Promise.all([
    supabase.from('ceo_approvals').select('id, approval_type, status, rejection_note').eq('case_id', id),
    supabase.from('bodywork_extras').select('id, description, status').eq('case_id', id),
    supabase.from('audit_events').select('id, action, user_id, created_at, payload').eq('entity_type', 'CASE').eq('entity_id', id).limit(50),
    supabase.from('case_documents').select('id, file_name, file_path, file_size, mime_type, document_type, created_at').eq('case_id', id).order('created_at', { ascending: false }),
    (stepIds.length > 0
      ? supabase.from('audit_events').select('id, action, user_id, created_at, payload').eq('entity_type', 'WORKFLOW_STEP').in('entity_id', stepIds)
      : Promise.resolve({ data: null })) as Promise<AuditResult>,
    supabase.from('profiles').select('id, full_name').eq('is_bodywork_advisor', true).eq('is_active', true).order('full_name'),
  ]);

  let auditRows: AuditRow[] = (caseAudit ?? []) as AuditRow[];
  if (stepAuditResult.data) {
    auditRows = [...auditRows, ...stepAuditResult.data];
  }
  auditRows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  auditRows = auditRows.slice(0, 20);

  const documents = (documentsData ?? []) as { id: string; file_name: string; file_path: string; file_size: number | null; mime_type: string | null; document_type: string | null; created_at: string }[];

  // Build userNames map from audit events + step.completed_by
  const userIdSet = new Set<string>();
  for (const e of auditRows) {
    if (e.user_id) userIdSet.add(e.user_id);
  }
  for (const s of steps) {
    if (s.completed_by) userIdSet.add(s.completed_by);
  }
  const userNames: Record<string, string> = {};
  if (userIdSet.size > 0) {
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', Array.from(userIdSet));
    for (const p of (profilesData ?? []) as { id: string; full_name: string | null }[]) {
      if (p.full_name) userNames[p.id] = p.full_name;
    }
  }

  const bodyworkAdvisors = (advisorsData ?? []) as { id: string; full_name: string }[];

  const car = Array.isArray(caseRow.cars) ? caseRow.cars[0] : caseRow.cars;
  const branch = Array.isArray(caseRow.branches) ? caseRow.branches[0] : caseRow.branches;
  const plate = car?.license_plate ?? '—';
  const firstReg = car?.first_registration_date ?? null;
  let age = '—';
  let carAgeYears: number | null = null;
  if (firstReg) {
    const years = (Date.now() - new Date(firstReg).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    carAgeYears = years;
    age = years < 1 ? '<1' : Math.floor(years).toString();
  } else if (car?.year) {
    carAgeYears = new Date().getFullYear() - car.year;
    age = carAgeYears < 1 ? '<1' : String(carAgeYears);
  }

  // Defensive: if the car turns out to be under 2 years old and WHEELS_CHECK
  // wasn't already SKIPPED, mark it now. This catches cases that were created
  // before year was filled in, or before the skip logic ran.
  if (carAgeYears !== null && carAgeYears < 2) {
    const wheelsStep = steps.find((s) => s.step_key === 'WHEELS_CHECK');
    if (wheelsStep && wheelsStep.state !== 'SKIPPED' && wheelsStep.state !== 'DONE') {
      await supabase
        .from('case_workflow_steps')
        .update({ state: 'SKIPPED' } as never)
        .eq('id', wheelsStep.id);
      // Also activate the next step if WHEELS_CHECK was blocking it
      if (wheelsStep.state === 'ACTIVE') {
        const nextStep = steps
          .filter((s) => s.order_index > wheelsStep.order_index)
          .sort((a, b) => a.order_index - b.order_index)[0];
        if (nextStep && nextStep.state === 'PENDING') {
          await supabase
            .from('case_workflow_steps')
            .update({ state: 'ACTIVE', activated_at: new Date().toISOString() } as never)
            .eq('id', nextStep.id);
        }
      }
      // Update local steps view so the UI reflects the fix immediately
      steps = steps.map((s) =>
        s.id === wheelsStep.id ? { ...s, state: 'SKIPPED' } : s
      );
    }
  }

  return (
    <CaseDetailClientV2
      caseId={id}
      caseKey={caseRow.case_key}
      claimNumber={caseRow.claim_number}
      plate={plate}
      branchName={branch?.name ?? '—'}
      openedAt={caseRow.opened_at}
      age={age}
      partsStatus={caseRow.parts_status as PartsStatus}
      generalStatus={caseRow.general_status as GeneralStatus}
      fixcarLink={caseRow.fixcar_link ?? null}
      wheelsCheckLink={caseRow.wheels_check_link ?? null}
      customerName={caseRow.customer_name ?? null}
      phone={caseRow.phone ?? null}
      insuranceCompany={caseRow.insurance_company ?? null}
      appraiserName={caseRow.appraiser_name ?? null}
      eventDate={caseRow.event_date ?? null}
      subClaimType={caseRow.sub_claim_type ?? null}
      insuranceType={caseRow.insurance_type ?? null}
      claimType={caseRow.claim_type ?? null}
      vehicleType={car?.vehicle_type ?? null}
      vehicleYear={car?.year ?? null}
      carMake={car?.make ?? null}
      carModel={car?.model ?? null}
      carVin={car?.vin ?? null}
      steps={steps}
      approvals={approvals ?? []}
      extras={extras ?? []}
      auditEvents={auditRows ?? []}
      documents={documents}
      role={profile?.role ?? null}
      userNames={userNames}
      stepTemplates={stepTemplates}
      notes={caseRow.notes ?? null}
      partsOrdered={caseRow.parts_ordered ?? null}
      partsArrived={caseRow.parts_arrived ?? null}
      qcAssignee={caseRow.qc_assignee ?? null}
      estimateLink={caseRow.estimate_link ?? null}
      painterStatus={caseRow.painter_status ?? null}
      appraiserStatus={caseRow.appraiser_status ?? null}
      carAgeYears={carAgeYears}
      bodyworkAdvisors={bodyworkAdvisors}
      enterWorkChecklistState={caseRow.enter_work_checklist_state ?? []}
      catalogNumbersAssignee={caseRow.catalog_numbers_assignee ?? null}
      partsDiscountsAssignee={caseRow.parts_discounts_assignee ?? null}
      completionPhotosAssignee={caseRow.completion_photos_assignee ?? null}
      treatmentFinishedAt={caseRow.treatment_finished_at ?? null}
      closedAt={caseRow.closed_at ?? null}
    />
  );
}

// ── Shell (renders immediately after case fetch) ───────────────────────────────

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role, branch_id, sees_all_branches')
    .eq('id', user.id)
    .single();

  const profile = profileData as { role: string; branch_id: string | null; sees_all_branches?: boolean } | null;

  // Case fetch — needed for access control and to pass data to CaseDetailData
  let caseRow: CaseRowMinimal | null = null;
  {
    const { data, error } = await supabase
      .from('cases')
      .select(
        'id,case_key,claim_number,fixcar_link,wheels_check_link,parts_status,opened_at,treatment_finished_at,closed_at,general_status,branch_id,customer_name,phone,insurance_company,appraiser_name,event_date,sub_claim_type,insurance_type,claim_type,notes,parts_ordered,parts_arrived,qc_assignee,estimate_link,painter_status,appraiser_status,enter_work_checklist_state,catalog_numbers_assignee,parts_discounts_assignee,completion_photos_assignee,cars(license_plate,first_registration_date,vehicle_type,year,make,model,vin),branches(name)'
      )
      .eq('id', id)
      .single();

    if (error) {
      // Fallback: include all customer-facing fields so they don't "disappear" when
      // a single newer column (eg the Session-6 jsonb additions) breaks the main SELECT.
      console.error('[cases/[id]/page] main SELECT failed — falling back', error);
      const { data: basicData } = await supabase
        .from('cases')
        .select(
          'id,case_key,claim_number,fixcar_link,wheels_check_link,parts_status,opened_at,treatment_finished_at,closed_at,general_status,branch_id,customer_name,phone,insurance_company,appraiser_name,event_date,sub_claim_type,insurance_type,claim_type,notes,parts_ordered,parts_arrived,qc_assignee,estimate_link,painter_status,appraiser_status,cars(license_plate,first_registration_date,vehicle_type,year,make,model,vin),branches(name)'
        )
        .eq('id', id)
        .single();
      caseRow = basicData as CaseRowMinimal | null;
    } else {
      caseRow = data as CaseRowMinimal | null;
    }
  }

  if (!caseRow) notFound();

  const branchId = caseRow.branch_id;
  if (profile?.role !== 'CEO' && !profile?.sees_all_branches && profile?.branch_id !== branchId) notFound();

  return (
    <Suspense fallback={<CaseDetailSkeleton />}>
      <CaseDetailData id={id} profile={profile} caseRow={caseRow} />
    </Suspense>
  );
}
