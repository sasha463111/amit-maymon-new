import { Suspense } from 'react';
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
      id, case_key, customer_name, phone, painter_status, painter_status_other_text, parts_arrived,
      painter_entered_work_at, parts_arrived_at,
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
    painter_status_other_text: string | null;
    parts_arrived: boolean | null;
    painter_entered_work_at: string | null;
    parts_arrived_at: string | null;
    opened_at: string | null;
    cars: { license_plate: string | null; make: string | null; model: string | null; year: number | null } | null;
    branches: { name: string } | null;
  };

  const car = Array.isArray(c.cars) ? c.cars[0] : c.cars;
  const branch = Array.isArray(c.branches) ? c.branches[0] : c.branches;

  // "מי לחץ + מתי" for the ENTER_WORK workflow step (the manager's action
  // that triggers the "רכב נכנס לעבודה" notification the painter just got) —
  // requested context so the painter isn't just told a car is ready, they
  // can see who marked it and when.
  let enterWorkCompletedAt: string | null = null;
  let enterWorkCompletedByName: string | null = null;
  {
    const { data: runData } = await supabase
      .from('case_workflow_runs')
      .select('id')
      .eq('case_id', params.id)
      .eq('workflow_type', 'PROFESSIONAL')
      .maybeSingle();
    const run = runData as { id: string } | null;
    if (run) {
      const { data: stepData } = await supabase
        .from('case_workflow_steps')
        .select('completed_at, completed_by')
        .eq('run_id', run.id)
        .eq('step_key', 'ENTER_WORK')
        .eq('state', 'DONE')
        .maybeSingle();
      const step = stepData as { completed_at: string | null; completed_by: string | null } | null;
      if (step?.completed_at) {
        enterWorkCompletedAt = step.completed_at;
        if (step.completed_by) {
          const { data: byProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', step.completed_by)
            .maybeSingle();
          enterWorkCompletedByName = (byProfile as { full_name: string | null } | null)?.full_name ?? null;
        }
      }
    }
  }

  // Load existing painter requests + their images
  const { data: requestsData } = await supabase
    .from('painter_requests')
    .select('id, description, request_type, status, created_at')
    .eq('case_id', params.id)
    .order('created_at', { ascending: false });

  const reqRows = (requestsData ?? []) as {
    id: string;
    description: string;
    request_type: string;
    status: string;
    created_at: string;
  }[];

  // Fetch images for all requests + build signed URLs for inline display.
  const requestIds = reqRows.map((r) => r.id);
  let imageRows: { request_id: string; image_path: string }[] = [];
  let signedImageUrls: Record<string, string> = {};
  if (requestIds.length > 0) {
    const { data: imagesData } = await supabase
      .from('painter_request_images')
      .select('request_id, image_path')
      .in('request_id', requestIds);
    imageRows = (imagesData ?? []) as { request_id: string; image_path: string }[];
    const paths = imageRows.map((i) => i.image_path);
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage.from('painter-images').createSignedUrls(paths, 3600);
      for (const e of (signed ?? []) as Array<{ path: string; signedUrl: string; error: string | null }>) {
        if (e.signedUrl && !e.error) signedImageUrls[e.path] = e.signedUrl;
      }
    }
  }

  // Group images by request_id and attach signed URLs.
  const imagesByRequest: Record<string, string[]> = {};
  for (const im of imageRows) {
    const url = signedImageUrls[im.image_path];
    if (!url) continue;
    if (!imagesByRequest[im.request_id]) imagesByRequest[im.request_id] = [];
    imagesByRequest[im.request_id].push(url);
  }

  const enrichedRequests = reqRows.map((r) => ({
    ...r,
    image_urls: imagesByRequest[r.id] ?? [],
  }));

  return (
    <Suspense fallback={null}>
      <PainterCaseClient
        caseId={c.id}
        caseKey={c.case_key}
        customerName={c.customer_name}
        phone={c.phone}
        painterStatus={c.painter_status}
        painterStatusOtherText={c.painter_status_other_text}
        partsArrived={c.parts_arrived ?? false}
        enteredWorkAt={c.painter_entered_work_at}
        partsArrivedAt={c.parts_arrived_at}
        enterWorkCompletedAt={enterWorkCompletedAt}
        enterWorkCompletedByName={enterWorkCompletedByName}
        openedAt={c.opened_at}
        licensePlate={car?.license_plate ?? null}
        carMake={car?.make ?? null}
        carModel={car?.model ?? null}
        carYear={car?.year ?? null}
        branchName={branch?.name ?? null}
        role={profile.role}
        initialRequests={enrichedRequests}
      />
    </Suspense>
  );
}
