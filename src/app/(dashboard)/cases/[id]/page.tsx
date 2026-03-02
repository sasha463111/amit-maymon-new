import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import type { PartsStatus, GeneralStatus } from '@/types/database';
import { PROFESSIONAL_WORKFLOW_STEPS } from '@/types/database';
import { CaseDetailClientV2 } from './CaseDetailClientV2';

type StepTemplate = {
  step_key: string;
  step_label: string;
  requires_link: boolean;
  requires_file_or_link: boolean;
};

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role, branch_id')
    .eq('id', user.id)
    .single();

  const profile = profileData as { role: string; branch_id: string | null } | null;

  // Try full select with new columns first; fall back to basic select if migration 006 not yet applied
  let caseRow: unknown = null;
  {
    const { data, error } = await supabase
      .from('cases')
      .select(
        'id,case_key,claim_number,fixcar_link,wheels_check_link,parts_status,opened_at,treatment_finished_at,closed_at,general_status,branch_id,customer_name,phone,insurance_company,appraiser_name,event_date,sub_claim_type,insurance_type,claim_type,cars(license_plate,first_registration_date,vehicle_type,year),branches(name)'
      )
      .eq('id', id)
      .single();

    if (error) {
      // Fallback: select only stable columns (migrations not yet applied to this DB)
      const { data: basicData } = await supabase
        .from('cases')
        .select(
          'id,case_key,claim_number,fixcar_link,parts_status,opened_at,treatment_finished_at,closed_at,general_status,branch_id,insurance_type,claim_type,cars(license_plate,first_registration_date),branches(name)'
        )
        .eq('id', id)
        .single();
      caseRow = basicData;
    } else {
      caseRow = data;
    }
  }

  if (!caseRow) notFound();

  const branchId = (caseRow as { branch_id: string }).branch_id;
  if (profile?.role !== 'CEO' && profile?.branch_id !== branchId) notFound();

  // CRITICAL FIX: Load steps by case_id (through all runs) to find steps even if run_id changes
  // First, get all runs for this case
  const { data: allRuns } = await supabase
    .from('case_workflow_runs')
    .select('id')
    .eq('case_id', id)
    .eq('workflow_type', 'PROFESSIONAL');
  
  let steps: { id: string; step_key: string; state: string; order_index: number; completed_at?: string | null; completed_by?: string | null }[] = [];
  
  if (allRuns && allRuns.length > 0) {
    // Get all run IDs for this case
    const runIds = allRuns.map((r) => (r as { id: string }).id);
    // Load steps for any of these runs
    const { data: stepsData } = await supabase
      .from('case_workflow_steps')
      .select('id, step_key, state, order_index, completed_at, completed_by')
      .in('run_id', runIds)
      .order('order_index');
    steps = stepsData ?? [];
    
    // DEBUG: Log what we found
    if (process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true') {
      console.log('[CASE DETAIL PAGE] Loaded steps by case_id:', {
        caseId: id,
        allRunsCount: allRuns.length,
        runIds,
        stepsCount: steps.length,
        steps: steps.map(s => ({ step_key: s.step_key, state: s.state })),
      });
    }
  } else {
    // DEBUG: Log if no runs found
    if (process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true') {
      console.log('[CASE DETAIL PAGE] No runs found for case:', id);
    }
  }
  
  // Get the active run for display
  const { data: runData } = await supabase
    .from('case_workflow_runs')
    .select('id')
    .eq('case_id', id)
    .eq('workflow_type', 'PROFESSIONAL')
    .eq('status', 'ACTIVE')
    .maybeSingle();
  
  const run = runData as { id: string } | null;
  
  // DEBUG: Log run status
  if (process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true') {
    console.log('[CASE DETAIL PAGE] Run check:', {
      caseId: id,
      hasRun: !!run,
      runId: run?.id,
      stepsCount: steps.length,
    });
  }
  
  // CRITICAL FIX: In PREVIEW mode, use the first run we found (don't create a new one)
  // This prevents creating duplicate runs that break the step lookup
  let actualRun = run;
  if (process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true') {
    // If we have runs but no active run, use the first one
    if (!run && allRuns && allRuns.length > 0) {
      actualRun = { id: (allRuns[0] as { id: string }).id };
      console.log('[CASE DETAIL PAGE] Using existing run instead of creating new one:', actualRun.id);
    } else if (!run) {
      // Only create a new run if there are NO runs at all
      console.log('[CASE DETAIL PAGE] No run found, creating one for case:', id);
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
        console.log('[CASE DETAIL PAGE] Created new run:', actualRun.id);
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
    
    // DEBUG: Log if no steps found
    if (process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true') {
      console.log('[CASE DETAIL PAGE] Steps check:', {
        runId: actualRun.id,
        stepsCount: steps.length,
        hasRun: !!actualRun,
      });
    }
    
    // CRITICAL FIX: If we have a run but no steps, create them (PREVIEW mode only)
    // This happens because steps are created on server but not saved to localStorage
    if (process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true' && steps.length === 0) {
      console.log('[CASE DETAIL PAGE] Creating missing workflow steps for run:', actualRun.id);
      const openedAt = (caseRow as { opened_at: string | null }).opened_at || new Date().toISOString();
      // Extract car data from caseRow
      const carData = Array.isArray((caseRow as { cars: unknown }).cars)
        ? (caseRow as { cars: { license_plate: string; first_registration_date: string | null }[] }).cars[0]
        : (caseRow as { cars: { license_plate: string; first_registration_date: string | null } | null }).cars;
      const firstReg = carData?.first_registration_date ?? null;
      const age = firstReg ? (Date.now() - new Date(firstReg).getTime()) / (365.25 * 24 * 60 * 60 * 1000) : null;
      const skipWheels = age !== null && age <= 2;
      
      // Create all steps with correct states
      for (let i = 0; i < PROFESSIONAL_WORKFLOW_STEPS.length; i++) {
        const stepKey = PROFESSIONAL_WORKFLOW_STEPS[i];
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
          order_index: i,
          activated_at: activatedAt,
          completed_at: completedAt,
        } as never);
      }
      
      // Reload steps after creating them
      const { data: newStepsData } = await supabase
        .from('case_workflow_steps')
        .select('id, step_key, state, order_index, completed_at, completed_by')
        .eq('run_id', actualRun.id)
        .order('order_index');
      steps = newStepsData ?? [];
      
      // DEBUG: Log after creating steps
      if (process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true') {
        console.log('[CASE DETAIL PAGE] Created and loaded steps:', {
          runId: actualRun.id,
          stepsCount: steps.length,
          steps: steps.map(s => ({ step_key: s.step_key, state: s.state })),
        });
      }
    }
    
    // DEBUG: Log steps loading
    if (process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true') {
      console.log('[CASE DETAIL PAGE] Loaded steps:', {
        runId: actualRun.id,
        caseId: id,
        stepsCount: steps.length,
        steps: steps.map(s => ({ step_key: s.step_key, state: s.state })),
      });
    }
  } else {
    // DEBUG: Log if run not found (and couldn't create one)
    if (process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true') {
      console.warn('[CASE DETAIL PAGE] No workflow run found for case and couldn\'t create one:', id);
    }
  }

  const { data: approvals } = await supabase
    .from('ceo_approvals')
    .select('id, approval_type, status, rejection_note')
    .eq('case_id', id);

  const { data: extras } = await supabase
    .from('bodywork_extras')
    .select('id, description, status')
    .eq('case_id', id);

  const stepIds = steps.map((s) => s.id);
  let auditRows: { id: string; action: string; user_id: string | null; created_at: string; payload: unknown }[] = [];
  const { data: caseAudit } = await supabase
    .from('audit_events')
    .select('id, action, user_id, created_at, payload')
    .eq('entity_type', 'CASE')
    .eq('entity_id', id);
  auditRows = (caseAudit ?? []) as typeof auditRows;
  if (stepIds.length > 0) {
    const { data: stepAudit } = await supabase
      .from('audit_events')
      .select('id, action, user_id, created_at, payload')
      .eq('entity_type', 'WORKFLOW_STEP')
      .in('entity_id', stepIds);
    auditRows = [...auditRows, ...((stepAudit ?? []) as typeof auditRows)];
  }
  auditRows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  auditRows = auditRows.slice(0, 20);

  // Load case documents
  const { data: documentsData } = await supabase
    .from('case_documents')
    .select('id, file_name, file_path, file_size, mime_type, created_at')
    .eq('case_id', id)
    .order('created_at', { ascending: false });
  const documents = (documentsData ?? []) as { id: string; file_name: string; file_path: string; file_size: number | null; mime_type: string | null; created_at: string }[];

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

  // Load workflow step templates
  const { data: stepTemplatesData } = await supabase
    .from('workflow_step_templates')
    .select('step_key, step_label, requires_link, requires_file_or_link')
    .eq('is_enabled', true)
    .order('order_index');
  const stepTemplates: StepTemplate[] = (stepTemplatesData ?? []) as StepTemplate[];

  type CaseRowTyped = {
    case_key: string | null;
    claim_number: string | null;
    fixcar_link: string | null;
    wheels_check_link: string | null;
    parts_status: string;
    opened_at: string | null;
    general_status: string;
    customer_name: string | null;
    phone: string | null;
    insurance_company: string | null;
    appraiser_name: string | null;
    event_date: string | null;
    sub_claim_type: string | null;
    insurance_type: string | null;
    claim_type: string | null;
    cars: { license_plate: string; first_registration_date: string | null; vehicle_type?: string | null; year?: number | null } | { license_plate: string; first_registration_date: string | null; vehicle_type?: string | null; year?: number | null }[] | null;
    branches: { name: string } | { name: string }[] | null;
  };
  const c = caseRow as CaseRowTyped;
  const car = Array.isArray(c.cars) ? c.cars[0] : c.cars;
  const branch = Array.isArray(c.branches) ? c.branches[0] : c.branches;
  const plate = car?.license_plate ?? '—';
  const firstReg = car?.first_registration_date ?? null;
  let age = '—';
  if (firstReg) {
    const years = (Date.now() - new Date(firstReg).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    age = years < 1 ? '<1' : Math.floor(years).toString();
  }

  return (
    <CaseDetailClientV2
      caseId={id}
      caseKey={c.case_key}
      claimNumber={c.claim_number}
      plate={plate}
      branchName={branch?.name ?? '—'}
      openedAt={c.opened_at}
      age={age}
      partsStatus={c.parts_status as PartsStatus}
      generalStatus={c.general_status as GeneralStatus}
      fixcarLink={c.fixcar_link ?? null}
      wheelsCheckLink={c.wheels_check_link ?? null}
      customerName={c.customer_name ?? null}
      phone={c.phone ?? null}
      insuranceCompany={c.insurance_company ?? null}
      appraiserName={c.appraiser_name ?? null}
      eventDate={c.event_date ?? null}
      subClaimType={c.sub_claim_type ?? null}
      insuranceType={c.insurance_type ?? null}
      claimType={c.claim_type ?? null}
      steps={steps}
      approvals={approvals ?? []}
      extras={extras ?? []}
      auditEvents={auditRows ?? []}
      documents={documents}
      role={profile?.role ?? null}
      userNames={userNames}
      stepTemplates={stepTemplates}
    />
  );
}
