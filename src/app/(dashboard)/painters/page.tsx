import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PaintersBoard, type PainterRow } from './PaintersBoard';

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

  const rawRows = (cases ?? []) as {
    id: string;
    case_key: string | null;
    customer_name: string | null;
    painter_status: string | null;
    appraiser_name: string | null;
    opened_at: string | null;
    cars: { license_plate: string | null; make: string | null; model: string | null; year: number | null } | { license_plate: string | null; make: string | null; model: string | null; year: number | null }[] | null;
    branches: { name: string } | { name: string }[] | null;
  }[];

  const rows: PainterRow[] = rawRows.map((row) => {
    const car = Array.isArray(row.cars) ? row.cars[0] : row.cars;
    const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches;
    return {
      id: row.id,
      case_key: row.case_key,
      customer_name: row.customer_name,
      painter_status: row.painter_status,
      appraiser_name: row.appraiser_name,
      opened_at: row.opened_at,
      license_plate: car?.license_plate ?? null,
      car_make: car?.make ?? null,
      car_model: car?.model ?? null,
      car_year: car?.year ?? null,
      branch_name: branch?.name ?? null,
    };
  });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">לוח פחחים</h1>
          <p className="text-sm text-gray-500 mt-0.5">{rows.length} תיקים פעילים</p>
        </div>
      </div>

      <PaintersBoard rows={rows} />
    </div>
  );
}
