import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArchiveTable } from './ArchiveTable';
import { ArrowLeft, Archive } from 'lucide-react';

export default async function DeletedCasesArchive() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = (profileData as { role: string } | null)?.role ?? null;
  if (role !== 'CEO') {
    redirect('/cases');
  }

  const { data: casesData } = await supabase
    .from('cases')
    .select(`
      id,
      case_key,
      claim_number,
      customer_name,
      opened_at,
      closed_at,
      deleted_at,
      deleted_by,
      branch_id,
      cars(license_plate)
    `)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  const cases = (casesData ?? []) as Array<{
    id: string;
    case_key: string | null;
    claim_number: string | null;
    customer_name: string | null;
    opened_at: string | null;
    closed_at: string | null;
    deleted_at: string;
    deleted_by: string | null;
    branch_id: string;
    cars: { license_plate: string | null } | { license_plate: string | null }[] | null;
  }>;

  const deleterIds = Array.from(new Set(cases.map((c) => c.deleted_by).filter(Boolean))) as string[];
  const branchIds = Array.from(new Set(cases.map((c) => c.branch_id)));

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

  const rows = cases.map((c) => {
    const car = Array.isArray(c.cars) ? c.cars[0] : c.cars;
    return {
      id: c.id,
      case_key: c.case_key ?? '—',
      plate: car?.license_plate ?? '—',
      claim: c.claim_number ?? '—',
      customer: c.customer_name ?? '—',
      opened_at: c.opened_at,
      closed_at: c.closed_at,
      deleted_at: c.deleted_at,
      deleted_by_name: c.deleted_by ? profileById.get(c.deleted_by) ?? '—' : '—',
      branch_name: branchById.get(c.branch_id) ?? '—',
    };
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
              <Archive size={18} className="text-rose-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">ארכיון תיקים מחוקים</h1>
          </div>
          <p className="text-sm text-gray-500 mr-13">
            {rows.length === 0 ? 'אין תיקים מחוקים' : `${rows.length} תיקים מחוקים — ניתן לשחזר`}
          </p>
        </div>
        <Link
          href="/cases"
          className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-3 py-2 rounded-lg border border-gray-200 transition-colors"
        >
          <ArrowLeft size={14} />
          חזרה לתיקים
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-gray-50 flex items-center justify-center mb-3">
            <Archive size={24} className="text-gray-400" />
          </div>
          <p className="text-gray-500">לא נמחק אף תיק בינתיים</p>
        </div>
      ) : (
        <ArchiveTable rows={rows} />
      )}
    </div>
  );
}
