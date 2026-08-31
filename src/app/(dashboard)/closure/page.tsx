import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ClosureCasesGrid, type ClosureCaseRow } from './ClosureCasesGrid';

export default async function ClosurePage() {
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
  const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true';
  if (!isPreview && profile?.role !== 'OFFICE' && profile?.role !== 'CEO') {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">סגירה</h1>
        <p className="text-gray-500">אין גישה לדף זה.</p>
      </div>
    );
  }

  // Branch tabs (הכל / נתיבות / אשקלון), same as /cases — a CEO sees every
  // branch's cases mixed by default and asked to be able to narrow to one.
  // Non-CEO users are already scoped to their own single branch below, so
  // they only ever see one option and the tabs stay hidden (branches.length
  // > 1 check in ClosureCasesGrid).
  const { data: branchesData } =
    profile?.role === 'CEO'
      ? await supabase.from('branches').select('id, name').order('name')
      : profile?.branch_id
        ? await supabase.from('branches').select('id, name').eq('id', profile.branch_id)
        : { data: [] };
  const branches = (branchesData ?? []) as { id: string; name: string }[];

  let casesQuery = supabase
    .from('cases')
    .select(
      `
      id,
      case_key,
      customer_name,
      branch_id,
      closed_at,
      opened_at,
      parts_status,
      insurance_type,
      insurance_company,
      claim_number,
      cars(license_plate, make, model, vehicle_type),
      branches(name)
    `
    )
    .is('closed_at', null)
    .is('deleted_at', null);

  if (profile && profile.role !== 'CEO' && profile.branch_id) {
    casesQuery = casesQuery.eq('branch_id', profile.branch_id);
  }

  const { data: casesRows } = await casesQuery;

  const runIds = await (async () => {
    if (!casesRows?.length) return [] as { id: string; case_id: string }[];
    const { data: runsData } = await supabase
      .from('case_workflow_runs')
      .select('id, case_id')
      .in('case_id', casesRows.map((c) => (c as { id: string }).id))
      .eq('workflow_type', 'PROFESSIONAL')
      .eq('status', 'COMPLETED');
    return (runsData ?? []) as { id: string; case_id: string }[];
  })();

  const readyCaseIds = new Set(runIds.map((r) => r.case_id));
  const list: ClosureCaseRow[] = (casesRows ?? [])
    .filter((c) => readyCaseIds.has((c as { id: string }).id))
    .map((c) => {
      const row = c as {
        id: string;
        case_key: string | null;
        customer_name: string | null;
        branch_id: string;
        opened_at: string | null;
        parts_status: string | null;
        insurance_type: string | null;
        insurance_company: string | null;
        cars: { license_plate: string | null; make: string | null; model: string | null; vehicle_type: string | null } | null;
        branches: { name: string } | null;
      };
      const car = Array.isArray(row.cars) ? row.cars[0] : row.cars;
      const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches;
      return {
        id: row.id,
        case_key: row.case_key,
        customer_name: row.customer_name,
        branch_id: row.branch_id,
        opened_at: row.opened_at,
        parts_status: row.parts_status,
        insurance_type: row.insurance_type,
        insurance_company: row.insurance_company,
        license_plate: car?.license_plate ?? null,
        make: car?.make ?? null,
        model: car?.model ?? null,
        // Case creation only fills `vehicle_type` (Ministry lookup) — make/model
        // are basically always empty in practice, same issue as the painters board.
        vehicle_type: car?.vehicle_type ?? null,
        branch_name: branch?.name ?? null,
      };
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">תיקים לסגירה</h1>
          <p className="text-sm text-stone-500 mt-1">תיקים שהעבודה הסתיימה ומחכים לטיפול משרדי</p>
        </div>
        {list.length > 0 && (
          <span className="px-4 py-2 bg-accent-soft text-accent-text rounded-full text-sm font-semibold">
            {list.length} תיקים ממתינים
          </span>
        )}
      </div>

      <ClosureCasesGrid cases={list} branches={branches} />
    </div>
  );
}
