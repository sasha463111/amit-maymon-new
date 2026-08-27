import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CasesMasterDetail, type RailCase } from './CasesMasterDetail';

const STEP_LABELS: Record<string, string> = {
  OPEN_CASE: 'פתיחת תיק',
  FIXCAR_PHOTOS: 'צילום FixCar',
  WHEELS_CHECK: 'טפסי גלגלים',
  PREP_ESTIMATE: 'אומדן',
  SEND_TO_APPRAISER: 'שליחה לשמאי',
  WAIT_APPRAISER_APPROVAL: 'המתנה לאישור שמאי',
  ENTER_WORK: 'כניסה לעבודה',
  ISSUE_CATALOG_NUMBERS: 'ניפוק מק"טים',
  PARTS_DISCOUNTS: 'הנחות חלקים ועבודות',
  QUALITY_CONTROL: 'בקרת איכות',
  WASH: 'שטיפה',
  SEND_COMPLETION_PHOTOS: 'שליחת תמונות לשמאי גמר תיקון',
  READY_FOR_OFFICE: 'מוכן למשרד',
};

export default async function CasesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role, branch_id')
    .eq('id', user.id)
    .single();
  const profile = profileData as { role: string; branch_id: string | null } | null;
  const role = profile?.role ?? null;
  const branchId = profile?.branch_id ?? null;
  const isCeo = role === 'CEO';
  const canCreate = role === 'SERVICE_MANAGER' || role === 'OFFICE' || role === 'CEO' || role === 'SERVICE_ADVISOR';

  let casesQuery = supabase
    .from('cases')
    .select('id, closed_at, notes, parts_status, general_status, customer_name, insurance_company, branch_id, cars!inner(license_plate)')
    .is('deleted_at', null)
    .order('opened_at', { ascending: false });
  if (role !== 'CEO' && branchId) casesQuery = casesQuery.eq('branch_id', branchId);

  const [{ data: casesRows }, { data: branchesData }] = await Promise.all([
    casesQuery,
    supabase.from('branches').select('id, name'),
  ]);

  const branches = (branchesData ?? []) as { id: string; name: string }[];
  const branchNameById: Record<string, string> = Object.fromEntries(branches.map((b) => [b.id, b.name]));

  const openCases = (casesRows ?? []).filter((c) => !(c as { closed_at: string | null }).closed_at);
  const caseIds = openCases.map((c) => (c as { id: string }).id);
  const safeIds = caseIds.length > 0 ? caseIds : ['00000000-0000-0000-0000-000000000000'];

  const [{ data: extrasData }, { data: approvalsData }, { data: runsData }] = await Promise.all([
    supabase.from('bodywork_extras').select('case_id').eq('status', 'IN_TREATMENT').in('case_id', safeIds),
    supabase.from('ceo_approvals').select('case_id, status').in('case_id', safeIds),
    supabase.from('case_workflow_runs').select('id, case_id').in('case_id', safeIds).eq('workflow_type', 'PROFESSIONAL').eq('status', 'ACTIVE'),
  ]);

  const extrasSet = new Set((extrasData ?? []).map((e) => (e as { case_id: string }).case_id));
  const approvalBlocked = new Set<string>();
  const ceoRejected = new Set<string>();
  for (const a of (approvalsData ?? []) as { case_id: string; status: string }[]) {
    if (a.status !== 'APPROVED') approvalBlocked.add(a.case_id);
    // There's exactly one ceo_approvals row per (case, approval_type) — decideApproval
    // updates it in place rather than inserting a new one — so a plain status check
    // here (no "latest per type" dedup needed) reflects the CEO's current decision:
    // if they later flip REJECTED → APPROVED on the same row, this clears on its own.
    if (a.status === 'REJECTED') ceoRejected.add(a.case_id);
  }
  const runIdToCaseId = new Map((runsData ?? []).map((r) => [(r as { id: string; case_id: string }).id, (r as { id: string; case_id: string }).case_id]));
  const runIds = Array.from(runIdToCaseId.keys());

  const { data: stepsData } = await supabase
    .from('case_workflow_steps')
    .select('run_id, step_key, state, order_index')
    .in('run_id', runIds.length > 0 ? runIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('state', 'ACTIVE');

  const caseIdToNextStep = new Map<string, string>();
  for (const s of (stepsData ?? []) as { run_id: string; step_key: string }[]) {
    const cid = runIdToCaseId.get(s.run_id);
    if (cid) caseIdToNextStep.set(cid, STEP_LABELS[s.step_key] ?? s.step_key);
  }

  const railCases: RailCase[] = openCases.map((c) => {
    const row = c as {
      id: string; customer_name: string | null; insurance_company: string | null; branch_id: string;
      cars: { license_plate: string | null } | { license_plate: string | null }[] | null;
    };
    const car = Array.isArray(row.cars) ? row.cars[0] : row.cars;
    return {
      id: row.id,
      plate: car?.license_plate ?? '—',
      customer_name: row.customer_name,
      insurer: row.insurance_company,
      branch_id: row.branch_id,
      nextStep: caseIdToNextStep.get(row.id) ?? null,
      approvalBlocked: approvalBlocked.has(row.id),
      hasExtrasInTreatment: extrasSet.has(row.id),
      hasCeoRejection: ceoRejected.has(row.id),
    };
  });

  return (
    <CasesMasterDetail
      cases={railCases}
      branches={branches}
      branchNameById={branchNameById}
      canCreate={canCreate}
      branchId={branchId}
      isCeo={isCeo}
    >
      {children}
    </CasesMasterDetail>
  );
}
