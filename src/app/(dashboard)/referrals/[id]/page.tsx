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

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('role, branch_ids')
    .eq('id', user.id)
    .single();
  const profile = profileData as { role: string; branch_ids: string[] } | null;
  const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true';

  // DEBUG: Log what's happening
  console.log('[referrals/[id]] Profile query:', {
    userId: user.id,
    profileData,
    profileError,
    profile,
    isPreview,
  });

  // Safety check: profile should always exist if user is logged in
  if (!profile && !isPreview) {
    console.log('[referrals/[id]] No profile found, redirecting to login');
    redirect('/login');
  }

  if (!isPreview && profile && profile.role !== 'OFFICE' && profile.role !== 'CEO') {
    console.log('[referrals/[id]] User role is neither OFFICE nor CEO:', profile.role);
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">הפנייה</h1>
        <p className="text-gray-500">אין גישה לדף זה. (Role: {profile.role})</p>
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

  // Branch access check: non-CEO users can only access referrals in their assigned branches
  if (!isPreview && profile && profile.role !== 'CEO' && !profile.branch_ids.includes(row.branch_id)) {
    notFound();
  }

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
