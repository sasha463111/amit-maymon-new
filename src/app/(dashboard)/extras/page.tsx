import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { ExtraStatus } from '@/types/database';
import { ExtrasManagerList } from './ExtrasManagerList';

export default async function ExtrasPage() {
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
  if (!isPreview && profile?.role !== 'SERVICE_MANAGER' && profile?.role !== 'CEO') {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">תוספות</h1>
        <p className="text-gray-500">אין גישה לדף זה.</p>
      </div>
    );
  }

  let caseIds: string[] | null = null;
  if (profile && profile.role !== 'CEO' && profile.branch_id) {
    const { data: branchCasesData } = await supabase
      .from('cases')
      .select('id')
      .eq('branch_id', profile.branch_id);
    const branchCases = (branchCasesData ?? []) as { id: string }[];
    caseIds = branchCases.map((c) => c.id);
  }

  let query = supabase
    .from('bodywork_extras')
    .select(`
      id,
      case_id,
      description,
      image_path,
      status,
      created_at,
      cases(case_key, cars(license_plate))
    `)
    .order('created_at', { ascending: false });

  if (caseIds && caseIds.length > 0) {
    query = query.in('case_id', caseIds);
  } else if (caseIds && caseIds.length === 0) {
    query = query.eq('case_id', '00000000-0000-0000-0000-000000000000');
  }

  const { data: rows } = await query;

  const rawExtras = (rows ?? []).map((r) => {
    const row = r as {
      id: string;
      case_id: string;
      description: string;
      image_path: string;
      status: string;
      created_at: string;
      cases: { case_key: string | null; cars: { license_plate: string | null } | null } | null;
    };
    const c = Array.isArray(row.cases) ? row.cases[0] : row.cases;
    const car = c && (Array.isArray(c.cars) ? c.cars[0] : c.cars);
    return {
      id: row.id,
      case_id: row.case_id,
      description: row.description,
      image_path: row.image_path,
      status: row.status as ExtraStatus,
      created_at: row.created_at,
      case_key: c?.case_key ?? null,
      plate: car?.license_plate ?? '—',
    };
  });

  // Batch-sign URLs for the extras-images bucket so the manager actually sees
  // what the painter uploaded. Without this the image_path is stored but the
  // UI just had a status pill and no proof of the work.
  const paths = rawExtras.map((e) => e.image_path).filter(Boolean);
  let signedImageUrls: Record<string, string> = {};
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from('extras-images')
      .createSignedUrls(paths, 3600);
    for (const e of (signed ?? []) as Array<{ path: string; signedUrl: string; error: string | null }>) {
      if (e.signedUrl && !e.error) signedImageUrls[e.path] = e.signedUrl;
    }
  }
  const extras = rawExtras.map((e) => ({ ...e, image_url: signedImageUrls[e.image_path] ?? null }));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">תוספות פחחות</h1>
      <ExtrasManagerList extras={extras} />
    </div>
  );
}
