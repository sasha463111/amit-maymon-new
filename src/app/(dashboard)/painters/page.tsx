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

const PAINTER_STATUS_BG: Record<string, string> = {
  IN_WORK: 'bg-blue-100',
  WAITING_PARTS: 'bg-yellow-100',
  PARTS_ARRIVED: 'bg-purple-100',
  READY_FOR_RELEASE: 'bg-green-100',
};

const PAINTER_STATUS_TEXT: Record<string, string> = {
  IN_WORK: 'text-blue-700',
  WAITING_PARTS: 'text-yellow-700',
  PARTS_ARRIVED: 'text-purple-700',
  READY_FOR_RELEASE: 'text-green-700',
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

  const profileRole = (profile as { role: string } | null)?.role;
  // PAINTER sees only their branch cases; CEO sees all
  if (profileRole !== 'CEO' && profileRole !== 'PAINTER' && profileRole !== 'SERVICE_MANAGER') redirect('/cases');

  // Fetch all open cases with painter-relevant fields (exclude soft-deleted)
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
    .is('deleted_at', null)
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
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">לוח פחחים</h1>
          <p className="text-sm text-gray-500 mt-0.5">{rows.length} תיקים פעילים</p>
        </div>
      </div>

      {/* Summary badges */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(PAINTER_STATUS_LABELS).map(([key, label]) => {
          const count = groups[key]?.length ?? 0;
          return (
            <div key={key} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className={`text-2xl font-bold ${PAINTER_STATUS_TEXT[key] ?? 'text-gray-700'}`}>{count}</p>
              </div>
              <div className={`w-10 h-10 rounded-full ${PAINTER_STATUS_BG[key] ?? 'bg-gray-100'} flex items-center justify-center`}>
                <span className={`text-lg font-black ${PAINTER_STATUS_TEXT[key] ?? 'text-gray-500'}`}>{count}</span>
              </div>
            </div>
          );
        })}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-1">ללא סטטוס</p>
            <p className="text-2xl font-bold text-gray-500">{groups['']?.length ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Groups */}
      {statusOrder.map((statusKey) => {
        const groupRows = groups[statusKey];
        if (!groupRows || groupRows.length === 0) return null;
        const label = statusKey ? PAINTER_STATUS_LABELS[statusKey] : 'ללא סטטוס פחח';
        const colorCls = statusKey ? PAINTER_STATUS_COLORS[statusKey] : 'bg-gray-100 text-gray-600';

        return (
          <div key={statusKey} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className={`px-5 py-3 flex items-center gap-3 border-b border-gray-100`}>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${colorCls}`}>{label}</span>
              <span className="text-sm text-gray-400">{groupRows.length} תיקים</span>
            </div>
            <div className="divide-y divide-gray-50">
              {groupRows.map((row) => {
                const car = Array.isArray(row.cars) ? row.cars[0] : row.cars;
                const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches;
                return (
                  <a
                    key={row.id}
                    href={`/painters/${row.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                  >
                    {/* Plate */}
                    <span className="font-bold text-primary-container text-sm w-24 shrink-0" dir="ltr">
                      {car?.license_plate ?? '—'}
                    </span>
                    {/* Customer name — bumped to second column for prominence */}
                    <span className="text-sm font-semibold text-gray-800 w-36 shrink-0 truncate" title={row.customer_name ?? ''}>
                      {row.customer_name ?? '—'}
                    </span>
                    {/* Make / Model / Year */}
                    <span className="text-sm text-gray-600 flex-1 font-medium">
                      {[car?.make, car?.model, car?.year].filter(Boolean).join(' ')}
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
