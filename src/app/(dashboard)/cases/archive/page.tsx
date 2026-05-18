import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArchiveTabs, type ArchiveRow } from './ArchiveTabs';
import { ArrowLeft, Archive } from 'lucide-react';

type RawCase = {
  id: string;
  case_key: string | null;
  claim_number: string | null;
  customer_name: string | null;
  phone: string | null;
  insurance_company: string | null;
  opened_at: string | null;
  treatment_finished_at: string | null;
  closed_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  branch_id: string;
  cars: { license_plate: string | null } | { license_plate: string | null }[] | null;
};

function rowFrom(c: RawCase, branchById: Map<string, string>, profileById: Map<string, string>): ArchiveRow {
  const car = Array.isArray(c.cars) ? c.cars[0] : c.cars;
  return {
    id: c.id,
    case_key: c.case_key ?? '—',
    plate: car?.license_plate ?? '—',
    claim: c.claim_number ?? '—',
    customer: c.customer_name ?? '—',
    phone: c.phone ?? null,
    insurance: c.insurance_company ?? null,
    opened_at: c.opened_at,
    treatment_finished_at: c.treatment_finished_at,
    closed_at: c.closed_at,
    deleted_at: c.deleted_at,
    deleted_by_name: c.deleted_by ? profileById.get(c.deleted_by) ?? '—' : '—',
    branch_name: branchById.get(c.branch_id) ?? '—',
  };
}

export default async function CasesArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
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

  const role = (profileData as { role: string; branch_id: string | null } | null)?.role ?? null;
  const userBranchId = (profileData as { role: string; branch_id: string | null } | null)?.branch_id ?? null;

  // Open to OFFICE / SERVICE_MANAGER / CEO. Others bounce back.
  if (role !== 'CEO' && role !== 'SERVICE_MANAGER' && role !== 'OFFICE') {
    redirect('/cases');
  }

  const { tab = 'closed' } = await searchParams;
  const activeTab = (['in_closure', 'closed', 'deleted'].includes(tab) ? tab : 'closed') as
    | 'in_closure'
    | 'closed'
    | 'deleted';

  // CEO sees all branches; others only their branch.
  const branchFilter = role === 'CEO' ? null : userBranchId;

  // Three independent counts so the user sees what's where.
  const baseSelect =
    'id, case_key, claim_number, customer_name, phone, insurance_company, opened_at, treatment_finished_at, closed_at, deleted_at, deleted_by, branch_id, cars(license_plate)';

  const inClosureQuery = supabase
    .from('cases')
    .select(baseSelect)
    .is('closed_at', null)
    .is('deleted_at', null)
    .not('treatment_finished_at', 'is', null)
    .order('treatment_finished_at', { ascending: false });

  const closedQuery = supabase
    .from('cases')
    .select(baseSelect)
    .not('closed_at', 'is', null)
    .is('deleted_at', null)
    .order('closed_at', { ascending: false });

  const deletedQuery = supabase
    .from('cases')
    .select(baseSelect)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  if (branchFilter) {
    inClosureQuery.eq('branch_id', branchFilter);
    closedQuery.eq('branch_id', branchFilter);
    deletedQuery.eq('branch_id', branchFilter);
  }

  // CEO sees deleted tab; others don't.
  const [inClosureRes, closedRes, deletedRes] = await Promise.all([
    inClosureQuery,
    closedQuery,
    role === 'CEO' ? deletedQuery : Promise.resolve({ data: [] }),
  ]);

  const allCases: RawCase[] = [
    ...((inClosureRes.data ?? []) as RawCase[]),
    ...((closedRes.data ?? []) as RawCase[]),
    ...((deletedRes.data ?? []) as RawCase[]),
  ];

  const deleterIds = Array.from(
    new Set(allCases.map((c) => c.deleted_by).filter(Boolean))
  ) as string[];
  const branchIds = Array.from(new Set(allCases.map((c) => c.branch_id)));

  const [{ data: profiles }, { data: branches }] = await Promise.all([
    deleterIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', deleterIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    branchIds.length
      ? supabase.from('branches').select('id, name').in('id', branchIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const profileById = new Map(((profiles ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));
  const branchById = new Map(((branches ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));

  const inClosureRows = ((inClosureRes.data ?? []) as RawCase[]).map((c) => rowFrom(c, branchById, profileById));
  const closedRows = ((closedRes.data ?? []) as RawCase[]).map((c) => rowFrom(c, branchById, profileById));
  const deletedRows = ((deletedRes.data ?? []) as RawCase[]).map((c) => rowFrom(c, branchById, profileById));

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
              <Archive size={18} className="text-rose-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">ארכיון תיקים</h1>
          </div>
          <p className="text-sm text-gray-500 mr-13">
            תיקים שיצאו מהזרימה הפעילה — אפשר להמשיך לעקוב או לפתוח שוב.
          </p>
        </div>
        <Link
          href="/cases"
          className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-3 py-2 rounded-lg border border-gray-200 transition-colors"
        >
          <ArrowLeft size={14} />
          חזרה לתיקים פעילים
        </Link>
      </div>

      <ArchiveTabs
        activeTab={activeTab}
        inClosure={inClosureRows}
        closed={closedRows}
        deleted={deletedRows}
        canRestoreDeleted={role === 'CEO'}
      />
    </div>
  );
}
