import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LicensePlate } from '@/components/ui/LicensePlate';
import { INSURANCE_TYPE_LABELS } from '@/types/database';

// Kept local (not merged into types/database.ts's plain-string PARTS_STATUS_LABELS)
// because this list needs the {label,color} badge shape with its own color
// scheme — ApprovalsList.tsx has a visually distinct emoji version of the
// same idea, so a shared constant would have to compromise one or the other.
// AIRMAIL_PENDING was missing here (real bug — a case with that parts_status
// simply showed no badge at all on the closure list, unlike every other status).
const PARTS_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  AVAILABLE: { label: 'חלקים זמינים', color: 'text-green-700 bg-green-50 border-green-200' },
  ORDERED: { label: 'חלקים הוזמנו', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  NO_PARTS: { label: 'אין חלקים', color: 'text-red-700 bg-red-50 border-red-200' },
  AIRMAIL_PENDING: { label: 'ממתין לדואר אוויר', color: 'text-blue-700 bg-blue-50 border-blue-200' },
};

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

  let casesQuery = supabase
    .from('cases')
    .select(
      `
      id,
      case_key,
      customer_name,
      closed_at,
      opened_at,
      parts_status,
      insurance_type,
      insurance_company,
      claim_number,
      cars(license_plate, make, model),
      branches(name)
    `
    )
    .is('closed_at', null);

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
  const list = (casesRows ?? []).filter((c) => readyCaseIds.has((c as { id: string }).id));

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

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-stone-200 shadow-sm">
          <div className="text-5xl mb-4">📭</div>
          <h3 className="text-lg font-semibold text-stone-700 mb-1">אין תיקים לסגירה</h3>
          <p className="text-stone-400 text-sm">כשתיקים יסיימו את שלב העבודה הם יופיעו כאן</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((c) => {
            const row = c as {
              id: string;
              case_key: string | null;
              customer_name: string | null;
              opened_at: string | null;
              parts_status: string | null;
              insurance_type: string | null;
              insurance_company: string | null;
              claim_number: string | null;
              cars: { license_plate: string | null; make: string | null; model: string | null } | null;
              branches: { name: string } | null;
            };
            const car = Array.isArray(row.cars) ? row.cars[0] : row.cars;
            const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches;
            const parts = row.parts_status ? PARTS_STATUS_LABELS[row.parts_status] : null;
            const daysOpen = row.opened_at
              ? Math.floor((Date.now() - new Date(row.opened_at).getTime()) / 86400000)
              : null;

            return (
              <Link key={row.id} href={`/closure/${row.id}`} className="block group h-full">
                <div className="h-full flex flex-col gap-3 bg-white rounded-xl border-[1.5px] border-stone-200 shadow-xs p-4 hover:border-accent/50 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-stone-900 truncate">
                      {row.customer_name ?? row.case_key ?? car?.license_plate ?? row.id}
                    </h3>
                    {row.insurance_type && (
                      <span className="shrink-0 px-2 py-0.5 bg-stone-100 text-stone-600 rounded text-[11px] font-medium">
                        {INSURANCE_TYPE_LABELS[row.insurance_type] ?? row.insurance_type}
                      </span>
                    )}
                  </div>

                  {car?.license_plate && <LicensePlate plate={car.license_plate} size="sm" />}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-stone-500">
                    {car?.make && <span>{car.make} {car.model}</span>}
                    {row.insurance_company && <span>🏢 {row.insurance_company}</span>}
                    {branch?.name && <span>📍 {branch.name}</span>}
                  </div>

                  <div className="flex-1" />

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {parts && (
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${parts.color}`}>
                          {parts.label}
                        </span>
                      )}
                      {daysOpen !== null && (
                        <span className={`text-[11px] font-medium ${daysOpen > 14 ? 'text-status-rejected-text' : daysOpen > 7 ? 'text-status-waiting-text' : 'text-stone-400'}`}>
                          ⏱ {daysOpen} ימים
                        </span>
                      )}
                    </div>
                    <span className="text-accent-text text-[12.5px] font-semibold group-hover:underline shrink-0">
                      פתח ←
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
