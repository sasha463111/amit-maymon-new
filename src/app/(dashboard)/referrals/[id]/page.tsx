import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { ReferralDetailClient } from './ReferralDetailClient';
import type { Referral, ReferralDocument } from '@/types/database';
import { getReferralStatusUpdates } from '@/app/actions/referrals';

export default async function ReferralDetailPage({ params }: { params: { id: string } }) {
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
        <h1 className="text-2xl font-bold mb-4">הפנייה</h1>
        <p className="text-gray-500">אין גישה לדף זה.</p>
      </div>
    );
  }

  const { data: referralData } = await supabase
    .from('referrals')
    .select('*, branches(name)')
    .eq('id', params.id)
    .single();
  if (!referralData) notFound();

  const row = referralData as Referral & { branches: { name: string } | { name: string }[] | null };
  const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches;

  const { data: docsData } = await supabase
    .from('referral_documents')
    .select('id, referral_id, file_name, file_path, file_size, mime_type, uploaded_by, created_at')
    .eq('referral_id', params.id)
    .order('created_at', { ascending: false });

  const { data: statusUpdates } = await getReferralStatusUpdates(params.id);

  return (
    <ReferralDetailClient
      referral={row}
      branchName={branch?.name ?? '—'}
      documents={(docsData ?? []) as ReferralDocument[]}
      initialStatusUpdates={statusUpdates}
    />
  );
}
