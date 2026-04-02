import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

const PAINTER_STATUS_LABELS: Record<string, string> = {
  IN_WORK: 'בעבודה',
  WAITING_PARTS: 'ממתין לחלקים',
  PARTS_ARRIVED: 'הגיעו חלקים',
  READY_FOR_RELEASE: 'מוכן לשחרור',
};

const PAINTER_STATUS_COLORS: Record<string, string> = {
  IN_WORK: 'bg-blue-100 text-blue-800',
  WAITING_PARTS: 'bg-yellow-100 text-yellow-800',
  PARTS_ARRIVED: 'bg-purple-100 text-purple-800',
  READY_FOR_RELEASE: 'bg-green-100 text-green-800',
};

export default async function PaintersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if ((profile as { role: string } | null)?.role !== 'CEO') redirect('/cases');

  // Fetch all open cases with painter-relevant fields
  const { data: cases } = await supabase
    .from('cases')
    .select(`
      id,
      case_key,
      customer_name,
      painter_status,
      appraiser_name,
      opened_at,
      cars(license_plate, make, model, year),
      branches(name)
    `)
    .is('closed_at', null)
    .order('opened_at', { ascending: false });

  const rows = (cases ?? []) as {
    id: string;
    case_key: string | null;
    customer_name: string | null;
    painter_status: string | null;
    appraiser_name: string | null;
    opened_at: string | null;
    cars: { license_plate: string | null; make: string | null; model: string | null; year: number | null } | { license_plate: string | null; make: string | null; model: string | null; year: number | null }[] | null;
    branches: { name: string } | { name: string }[] | null;
  }[];

  // Group by painter_status
  const groups: Record<string, typeof rows> = {
    READY_FOR_RELEASE: [],
    PARTS_ARRIVED: [],
    WAITING_PARTS: [],
    IN_WORK: [],
    '': [],
  };

  for (const row of rows) {
    const key = row.painter_status ?? '';
    if (groups[key] !== undefined) {
      groups[key].push(row);
    } else {
      groups[''].push(row);
    }
  }

  const statusOrder = ['READY_FOR_RELEASE', 'PARTS_ARRIVED', 'WAITING_PARTS', 'IN_WORK', ''];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">לוח פחחים</h1>
        <span className="text-sm text-gray-400">{rows.length} תיקים פעילים</span>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(PAINTER_STATUS_LABELS).map(([key, label]) => {
          const count = groups[key]?.length ?? 0;
          return (
            <div key={key} className={`px-4 py-2 rounded-xl text-sm font-semibold ${PAINTER_STATUS_COLORS[key] ?? 'bg-gray-100 text-gray-600'}`}>
              {label}: {count}
            </div>
          );
        })}
        <div className="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600">
          ללא סטטוס: {groups['']?.length ?? 0}
        </div>
      </div>

      {/* Groups */}
      {statusOrder.map((statusKey) => {
        const groupRows = groups[statusKey];
        if (!groupRows || groupRows.length === 0) return null;
        const label = statusKey ? PAINTER_STATUS_LABELS[statusKey] : 'ללא סטטוס פחח';
        const colorCls = statusKey ? PAINTER_STATUS_COLORS[statusKey] : 'bg-gray-100 text-gray-600';

        return (
          <div key={statusKey} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className={`px-5 py-3 flex items-center gap-3 border-b border-gray-100 ${colorCls} bg-opacity-40`}>
              <span className="font-bold text-base">{label}</span>
              <span className="text-sm opacity-70">{groupRows.length} תיקים</span>
            </div>
            <div className="divide-y divide-gray-100">
              {groupRows.map((row) => {
                const car = Array.isArray(row.cars) ? row.cars[0] : row.cars;
                const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches;
                return (
                  <a
                    key={row.id}
                    href={`/cases/${row.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    {/* Plate */}
                    <span className="font-bold text-gray-900 text-sm w-24 shrink-0" dir="ltr">
                      {car?.license_plate ?? '—'}
                    </span>
                    {/* Make / Model / Year */}
                    <span className="text-sm text-gray-600 flex-1">
                      {[car?.make, car?.model, car?.year].filter(Boolean).join(' ')}
                    </span>
                    {/* Customer */}
                    <span className="text-sm text-gray-500 w-32 shrink-0 truncate">
                      {row.customer_name ?? '—'}
                    </span>
                    {/* Appraiser */}
                    <span className="text-xs text-gray-400 w-24 shrink-0 truncate">
                      {row.appraiser_name ?? '—'}
                    </span>
                    {/* Branch */}
                    <span className="text-xs text-gray-400 w-20 shrink-0 text-left">
                      {branch?.name ?? '—'}
                    </span>
                    {/* Opened */}
                    <span className="text-xs text-gray-400 w-20 shrink-0 text-left">
                      {row.opened_at ? new Date(row.opened_at).toLocaleDateString('he-IL') : '—'}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
