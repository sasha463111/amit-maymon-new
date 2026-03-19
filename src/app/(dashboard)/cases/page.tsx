import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { PartsStatus } from '@/types/database';
import { CasesViewWrapper } from './CasesViewWrapper';
import { CreateCaseButton } from './CreateCaseButton';
import { SystemMessageBanner } from './SystemMessageBanner';
import { LayoutGrid, Wrench, Package, Plane, CheckCircle } from 'lucide-react';

// ── Skeleton shown while data loads ──────────────────────────────────────────

function CasesPageSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl h-24 bg-gray-200 animate-pulse" />
        ))}
      </div>
      <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
        <div className="p-4 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    </>
  );
}

type StatBlock = {
  label: string;
  total: number;
  inWork: number;
  waitingParts: number;
  airmail: number;
  readyForRelease: number;
};

function StatRow({ stat, highlight }: { stat: StatBlock; highlight?: boolean }) {
  return (
    <div className={`grid grid-cols-5 gap-3 ${highlight ? '' : 'opacity-80'}`}>
      {/* Branch label cell */}
      <div className={`col-span-5 -mb-1 text-xs font-semibold ${highlight ? 'text-gray-700' : 'text-gray-500'}`}>
        {stat.label}
      </div>
      <div className={`rounded-xl border shadow-sm p-4 flex items-center gap-3 ${highlight ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-100'}`}>
        <div className="bg-slate-100 rounded-lg p-2 flex-shrink-0">
          <LayoutGrid size={16} className="text-slate-600" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-800 leading-none">{stat.total}</p>
          <p className="text-xs text-gray-500 mt-0.5">סה&quot;כ פתוחים</p>
        </div>
      </div>
      <div className={`rounded-xl border shadow-sm p-4 flex items-center gap-3 ${highlight ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-100'}`}>
        <div className="bg-emerald-50 rounded-lg p-2 flex-shrink-0">
          <Wrench size={16} className="text-emerald-600" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-800 leading-none">{stat.inWork}</p>
          <p className="text-xs text-gray-500 mt-0.5">בעבודה</p>
        </div>
      </div>
      <div className={`rounded-xl border shadow-sm p-4 flex items-center gap-3 ${highlight ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-100'}`}>
        <div className="bg-amber-50 rounded-lg p-2 flex-shrink-0">
          <Package size={16} className="text-amber-600" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-800 leading-none">{stat.waitingParts}</p>
          <p className="text-xs text-gray-500 mt-0.5">ממתינים לחלקים</p>
        </div>
      </div>
      <div className={`rounded-xl border shadow-sm p-4 flex items-center gap-3 ${highlight ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-100'}`}>
        <div className="bg-sky-50 rounded-lg p-2 flex-shrink-0">
          <Plane size={16} className="text-sky-600" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-800 leading-none">{stat.airmail}</p>
          <p className="text-xs text-gray-500 mt-0.5">דואר אוויר</p>
        </div>
      </div>
      <div className={`rounded-xl border shadow-sm p-4 flex items-center gap-3 ${highlight ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-100'}`}>
        <div className="bg-green-50 rounded-lg p-2 flex-shrink-0">
          <CheckCircle size={16} className="text-green-600" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-800 leading-none">{stat.readyForRelease}</p>
          <p className="text-xs text-gray-500 mt-0.5">מוכן לשחרור</p>
        </div>
      </div>
    </div>
  );
}

// ── Heavy data component (streams in after shell) ─────────────────────────────

async function CasesDataSection({
  role,
  branchId,
  isCeo,
}: {
  role: string | null;
  branchId: string | null;
  isCeo: boolean;
}) {
  const supabase = await createClient();

  let casesQuery = supabase
    .from('cases')
    .select(
      `
      id,
      case_key,
      claim_number,
      opened_at,
      parts_status,
      general_status,
      closed_at,
      notes,
      painter_status,
      cars!inner(license_plate, first_registration_date),
      branch_id
    `
    )
    .order('opened_at', { ascending: false });

  if (role !== 'CEO' && branchId) {
    casesQuery = casesQuery.eq('branch_id', branchId);
  }

  // Fetch branches, system message, and cases in parallel
  const [{ data: casesRows }, { data: branchesData }, { data: sysMessages }] = await Promise.all([
    casesQuery,
    isCeo ? supabase.from('branches').select('id, name') : Promise.resolve({ data: [] }),
    supabase.from('system_messages').select('id, message').eq('is_active', true).order('created_at', { ascending: false }).limit(1),
  ]);

  const sysMessage = (sysMessages ?? [])[0] as { id: string; message: string } | undefined;
  const branches = (branchesData ?? []) as { id: string; name: string }[];

  const openCases = (casesRows ?? []).filter((c) => !(c as { closed_at: string | null }).closed_at);
  const caseIds = openCases.map((c) => (c as { id: string }).id);

  // Parallelise: extras, approvals, and runs are all independent of each other
  const [{ data: extrasByCaseData }, { data: approvalsByCaseData }, { data: runsData }] =
    await Promise.all([
      supabase.from('bodywork_extras').select('case_id').eq('status', 'IN_TREATMENT').in('case_id', caseIds),
      supabase.from('ceo_approvals').select('case_id, status').in('case_id', caseIds),
      supabase
        .from('case_workflow_runs')
        .select('id, case_id')
        .in('case_id', caseIds)
        .eq('workflow_type', 'PROFESSIONAL')
        .eq('status', 'ACTIVE'),
    ]);

  const extrasByCase = (extrasByCaseData ?? []) as { case_id: string }[];
  const caseIdsWithExtras = new Set(extrasByCase.map((e) => e.case_id));

  const approvalsByCase = (approvalsByCaseData ?? []) as { case_id: string; status: string }[];
  const caseIdsApprovalBlocked = new Set<string>();
  for (const a of approvalsByCase) {
    if (a.status !== 'APPROVED') caseIdsApprovalBlocked.add(a.case_id);
  }
  const runIds = (runsData ?? []).map((r) => (r as { id: string; case_id: string }).id);
  const runIdToCaseId = new Map(
    (runsData ?? []).map((r) => [(r as { id: string; case_id: string }).id, (r as { id: string; case_id: string }).case_id])
  );

  const { data: stepsData } = await supabase
    .from('case_workflow_steps')
    .select('id, run_id, step_key, state, order_index')
    .in('run_id', runIds.length > 0 ? runIds : ['00000000-0000-0000-0000-000000000000'])
    .order('order_index');

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

  // ENTER_WORK order_index in new workflow = 6
  const ENTER_WORK_ORDER_INDEX = 6;

  const caseIdToNextStep = new Map<string, string>();
  const caseIdToNextStepKey = new Map<string, string>();
  const caseIdToActiveStepIndex = new Map<string, number>();

  if (stepsData && runIds.length > 0) {
    const stepsByRun = new Map<string, typeof stepsData>();
    for (const step of stepsData) {
      const runId = (step as { run_id: string }).run_id;
      if (!stepsByRun.has(runId)) stepsByRun.set(runId, []);
      stepsByRun.get(runId)!.push(step);
    }

    for (const [runId, runSteps] of Array.from(stepsByRun.entries())) {
      const caseId = runIdToCaseId.get(runId);
      if (!caseId) continue;

      const sortedSteps = [...runSteps].sort((a, b) =>
        (a as { order_index: number }).order_index - (b as { order_index: number }).order_index
      );
      const activeStep = sortedSteps.find((s) => (s as { state: string }).state === 'ACTIVE');
      if (activeStep) {
        const stepKey = (activeStep as { step_key: string }).step_key;
        const stepOrderIndex = (activeStep as { order_index: number }).order_index;
        caseIdToNextStep.set(caseId, STEP_LABELS[stepKey] || stepKey);
        caseIdToNextStepKey.set(caseId, stepKey);
        caseIdToActiveStepIndex.set(caseId, stepOrderIndex);
      }
    }
  }

  const casesWithMeta = openCases.map((c) => {
    const row = c as {
      id: string;
      case_key: string | null;
      claim_number: string | null;
      opened_at: string | null;
      parts_status: string;
      general_status: string;
      notes: string | null;
      painter_status: string | null;
      branch_id: string;
      cars: { license_plate: string | null; first_registration_date: string | null } | null;
    };
    const car = Array.isArray(row.cars) ? row.cars[0] : row.cars;
    const plate = car?.license_plate ?? '—';
    const firstReg = car?.first_registration_date ?? null;
    let age: string = '—';
    if (firstReg) {
      const years = (Date.now() - new Date(firstReg).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      age = years < 1 ? '<1' : Math.floor(years).toString();
    }
    return {
      id: row.id,
      case_key: row.case_key ?? null,
      plate,
      claim: row.claim_number ?? '—',
      opened_at: row.opened_at,
      age,
      parts_status: row.parts_status as PartsStatus,
      general_status: row.general_status,
      nextStep: caseIdToNextStep.get(row.id) || null,
      activeStepKey: caseIdToNextStepKey.get(row.id) || null,
      notes: row.notes ?? null,
      painter_status: row.painter_status ?? null,
      branch_id: row.branch_id,
    };
  });

  function computeStats(cases: typeof casesWithMeta, label: string): StatBlock {
    const total = cases.length;
    const inWork = cases.filter((c) => {
      const idx = caseIdToActiveStepIndex.get(c.id);
      return idx !== undefined && idx >= ENTER_WORK_ORDER_INDEX;
    }).length;
    const waitingParts = cases.filter(
      (c) => c.parts_status === 'ORDERED' || c.parts_status === 'NO_PARTS'
    ).length;
    const airmail = cases.filter((c) => c.parts_status === 'AIRMAIL_PENDING').length;
    const readyForRelease = cases.filter((c) => c.painter_status === 'READY_FOR_RELEASE').length;
    return { label, total, inWork, waitingParts, airmail, readyForRelease };
  }

  const allStats = computeStats(casesWithMeta, 'כל הסניפים');

  // Per-branch stats (only for CEO and only if branches are known)
  const branchStats: StatBlock[] = isCeo
    ? branches.map((b) =>
        computeStats(
          casesWithMeta.filter((c) => c.branch_id === b.id),
          b.name
        )
      )
    : [];

  return (
    <>
      {/* CEO daily message banner */}
      <SystemMessageBanner
        message={sysMessage?.message ?? null}
        messageId={sysMessage?.id ?? null}
        isCeo={isCeo}
      />

      {/* Statistics */}
      <div className="space-y-4 mb-6">
        <StatRow stat={allStats} highlight />
        {branchStats.map((bs) => (
          <StatRow key={bs.label} stat={bs} />
        ))}
      </div>

      <CasesViewWrapper
        cases={casesWithMeta.map((c) => ({
          ...c,
          hasExtrasInTreatment: caseIdsWithExtras.has(c.id),
          approvalBlocked: caseIdsApprovalBlocked.has(c.id),
        }))}
        role={role}
      />
    </>
  );
}

// ── Shell (renders immediately) ───────────────────────────────────────────────

export default async function CasesPage() {
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
  const role = profile?.role ?? null;
  const branchId = profile?.branch_id ?? null;

  const canCreate = role === 'SERVICE_MANAGER' || role === 'OFFICE' || role === 'CEO';
  const isCeo = role === 'CEO';

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">תיקים פתוחים</h1>
          </div>
          {canCreate && (
            <CreateCaseButton
              branchId={branchId}
              isCeo={isCeo}
            />
          )}
        </div>

        <Suspense fallback={<CasesPageSkeleton />}>
          <CasesDataSection role={role} branchId={branchId} isCeo={isCeo} />
        </Suspense>
      </div>
    </div>
  );
}
