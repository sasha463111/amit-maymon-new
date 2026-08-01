import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { LicensePlate } from '@/components/ui/LicensePlate';

const PAINTER_STATUS_LABELS: Record<string, string> = {
  IN_WORK: 'בעבודה',
  WAITING_PARTS: 'ממתין לחלקים',
  PARTS_ARRIVED: 'הגיעו חלקים',
  READY_FOR_RELEASE: 'מוכן לשחרור',
};

const PAINTER_STATUS_ICON: Record<string, string> = {
  IN_WORK: '🔧',
  WAITING_PARTS: '⏳',
  PARTS_ARRIVED: '🎨',
  READY_FOR_RELEASE: '✅',
};

// Column header: colored fill + a bottom border in the deeper shade of the same hue.
const PAINTER_STATUS_COLUMN_HEAD: Record<string, string> = {
  IN_WORK: 'bg-blue-100 border-blue-400 text-blue-800',
  WAITING_PARTS: 'bg-yellow-100 border-yellow-400 text-yellow-800',
  PARTS_ARRIVED: 'bg-purple-100 border-purple-400 text-purple-800',
  READY_FOR_RELEASE: 'bg-green-100 border-green-400 text-green-800',
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

      {/* Board — one column per status, cases with no status only shown if any exist */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statusOrder.filter((k) => k !== '' || (groups['']?.length ?? 0) > 0).map((statusKey) => {
          const groupRows = groups[statusKey] ?? [];
          const label = statusKey ? PAINTER_STATUS_LABELS[statusKey] : 'ללא סטטוס פחח';
          const headCls = statusKey ? PAINTER_STATUS_COLUMN_HEAD[statusKey] : 'bg-gray-100 border-gray-300 text-gray-600';
          const icon = statusKey ? PAINTER_STATUS_ICON[statusKey] : '⚪';

          return (
            <div key={statusKey} className="rounded-xl border border-gray-200 bg-gray-50/40 flex flex-col min-h-[12rem]">
              <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl border-b-2 ${headCls}`}>
                <span className="text-sm font-bold flex items-center gap-1.5">
                  <span>{icon}</span>
                  {label}
                </span>
                <span className="text-xs font-bold bg-black/10 px-2 py-0.5 rounded-full">{groupRows.length}</span>
              </div>

              <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-20rem)]">
                {groupRows.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">אין תיקים</p>
                ) : (
                  groupRows.map((row) => {
                    const car = Array.isArray(row.cars) ? row.cars[0] : row.cars;
                    const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches;
                    const carLine = [car?.make, car?.model, car?.year].filter(Boolean).join(' ');
                    return (
                      <a
                        key={row.id}
                        href={`/painters/${row.id}`}
                        className="block bg-white rounded-lg border border-gray-200 shadow-sm p-3 hover:shadow-md hover:border-brand-red/30 transition-all"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-bold text-gray-900 text-sm truncate" title={row.customer_name ?? ''}>
                            {row.customer_name ?? '—'}
                          </span>
                          {car?.license_plate && <LicensePlate plate={car.license_plate} size="sm" />}
                        </div>
                        {carLine && <p className="text-xs text-gray-500 mb-2">{carLine}</p>}
                        <div className="flex items-center justify-between text-[11px] text-gray-400 border-t border-gray-100 pt-1.5">
                          <span className="truncate max-w-[55%]">{row.appraiser_name ?? '—'}</span>
                          <span>
                            {branch?.name && `${branch.name} · `}
                            {row.opened_at ? new Date(row.opened_at).toLocaleDateString('he-IL') : '—'}
                          </span>
                        </div>
                      </a>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
