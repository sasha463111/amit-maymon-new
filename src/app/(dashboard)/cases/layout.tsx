import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CasesMasterDetail, type RailCase } from './CasesMasterDetail';
import { PROFESSIONAL_STEP_LABELS as STEP_LABELS } from '@/types/database';

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

  const [{ data: extrasData }, { data: approvalsData }, { data: runsData }, { data: notifData }] = await Promise.all([
    supabase.from('bodywork_extras').select('case_id').eq('status', 'IN_TREATMENT').in('case_id', safeIds),
    supabase.from('ceo_approvals').select('case_id, status').in('case_id', safeIds),
    supabase.from('case_workflow_runs').select('id, case_id').in('case_id', safeIds).eq('workflow_type', 'PROFESSIONAL').eq('status', 'ACTIVE'),
    supabase.from('notifications').select('case_id, type').eq('user_id', user.id).eq('read', false).in('case_id', safeIds),
  ]);

  // Same red/amber tiers as the notifications bell (NotificationsList.tsx's
  // TYPE_COLOR) — red = blocked/rejected, amber = needs your action. Personal
  // per-user, from unread notifications only: read one, its case stops being
  // flagged for you specifically, even if it's still flagged for someone else
  // who hasn't read theirs yet.
  const RED_TYPES = new Set(['BLOCKER', 'BLOCKED_ACTION', 'CEO_REJECTED']);
  const AMBER_TYPES = new Set(['PENDING_APPROVAL', 'PAINTER_REQUEST', 'APPROVAL_NEEDED', 'APPROVAL_REQUIRED', 'EXTRA_CREATED']);
  const notifSeverityByCase = new Map<string, 'red' | 'yellow'>();
  for (const n of (notifData ?? []) as { case_id: string | null; type: string | null }[]) {
    if (!n.case_id) continue;
    const current = notifSeverityByCase.get(n.case_id);
    if (current === 'red') continue; // red already wins, nothing to upgrade
    if (n.type && RED_TYPES.has(n.type)) notifSeverityByCase.set(n.case_id, 'red');
    else if (n.type && AMBER_TYPES.has(n.type)) notifSeverityByCase.set(n.case_id, 'yellow');
  }

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

  // Count unread notifications per case for highlighting
  const unreadNotifCount = new Map<string, number>();
  for (const n of (notifData ?? []) as { case_id: string | null }[]) {
    if (!n.case_id) continue;
    unreadNotifCount.set(n.case_id, (unreadNotifCount.get(n.case_id) ?? 0) + 1);
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
      notifSeverity: notifSeverityByCase.get(row.id) ?? null,
      unreadNotificationCount: unreadNotifCount.get(row.id) ?? 0,
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
