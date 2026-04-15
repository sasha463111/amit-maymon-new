import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PainterCaseClient } from './PainterCaseClient';

export default async function PainterCasePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profileData } = await supabase
    .from('profiles')
    .select('id, role, branch_id, full_name')
    .eq('id', user.id)
    .single();
  const profile = profileData as { id: string; role: string; branch_id: string | null; full_name: string | null } | null;

  // Only PAINTER, SERVICE_MANAGER, CEO can access painter case page
  const allowed = ['PAINTER', 'SERVICE_MANAGER', 'CEO'];
  if (!profile || !allowed.includes(profile.role)) redirect('/cases');

  const { data: caseData } = await supabase
    .from('cases')
    .select(`
      id, case_key, customer_name, phone, painter_status, parts_arrived,
      opened_at,
      cars(license_plate, make, model, year),
      branches(name)
    `)
    .eq('id', params.id)
    .is('deleted_at', null)
    .single();

  if (!caseData) redirect('/painters');

  const c = caseData as {
    id: string;
    case_key: string | null;
    customer_name: string | null;
    phone: string | null;
    painter_status: string | null;
    parts_arrived: boolean | null;
    opened_at: string | null;
    cars: { license_plate: string | null; make: string | null; model: string | null; year: number | null } | null;
    branches: { name: string } | null;
  };

  const car = Array.isArray(c.cars) ? c.cars[0] : c.cars;
  const branch = Array.isArray(c.branches) ? c.branches[0] : c.branches;

  // Load existing painter requests
  const { data: requestsData } = await supabase
    .from('painter_requests')
    .select('id, description, request_type, status, created_at')
    .eq('case_id', params.id)
    .order('created_at', { ascending: false });

  return (
    <PainterCaseClient
      caseId={c.id}
      caseKey={c.case_key}
      customerName={c.customer_name}
      phone={c.phone}
      painterStatus={c.painter_status}
      partsArrived={c.parts_arrived ?? false}
      openedAt={c.opened_at}
      licensePlate={car?.license_plate ?? null}
      carMake={car?.make ?? null}
      carModel={car?.model ?? null}
      carYear={car?.year ?? null}
      branchName={branch?.name ?? null}
      role={profile.role}
      initialRequests={(requestsData ?? []) as {
        id: string;
        description: string;
        request_type: string;
        status: string;
        created_at: string;
      }[]}
    />
  );
}
