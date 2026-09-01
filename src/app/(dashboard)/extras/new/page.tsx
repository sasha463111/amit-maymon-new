import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CreateExtraForm } from './CreateExtraForm';

export default async function NewExtraPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role, branch_ids')
    .eq('id', user.id)
    .single();

  const profile = profileData as { role: string; branch_ids: string[] } | null;
  const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true';
  if (!isPreview && profile?.role !== 'PAINTER') {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">תוספת חדשה</h1>
        <p className="text-gray-500">אין גישה לדף זה.</p>
      </div>
    );
  }

  let casesQuery = supabase
    .from('cases')
    .select('id, case_key, cars(license_plate)')
    .is('closed_at', null)
    .is('deleted_at', null)
    .order('opened_at', { ascending: false });

  if (profile?.branch_ids && profile.branch_ids.length > 0) {
    casesQuery = casesQuery.in('branch_id', profile.branch_ids);
  }

  const { data: casesRows } = await casesQuery;

  const cases = (casesRows ?? []).map((c) => {
    const row = c as {
      id: string;
      case_key: string | null;
      cars: { license_plate: string | null } | null;
    };
    const car = Array.isArray(row.cars) ? row.cars[0] : row.cars;
    return {
      id: row.id,
      label: `${row.case_key ?? row.id} — ${car?.license_plate ?? '—'}`,
    };
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">תוספת פחחות חדשה</h1>
      <CreateExtraForm cases={cases} />
    </div>
  );
}
