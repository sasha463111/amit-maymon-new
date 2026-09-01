import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NewReferralButton } from './NewReferralButton';
import { ReferralsGrid, type ReferralRow } from './ReferralsGrid';

export default async function ReferralsPage() {
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
  if (!isPreview && profile?.role !== 'OFFICE' && profile?.role !== 'CEO') {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">הפניות</h1>
        <p className="text-gray-500">אין גישה לדף זה.</p>
      </div>
    );
  }

  // Branch tabs (הכל / נתיבות / אשקלון), same pattern as /cases and /closure —
  // OFFICE staff with multiple branches can filter between them (branch_ids array).
  // (branches.length > 1 check in ReferralsGrid hides tabs if only 1 option)
  const { data: branchesData } =
    profile?.role === 'CEO'
      ? await supabase.from('branches').select('id, name').order('name')
      : profile?.branch_ids && profile.branch_ids.length > 0
        ? await supabase.from('branches').select('id, name').in('id', profile.branch_ids)
        : { data: [] };
  const branches = (branchesData ?? []) as { id: string; name: string }[];
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

  let referralsQuery = supabase
    .from('referrals')
    .select('id, branch_id, customer_name, insurance_company, plate_number, status_note, current_status_tag, follow_up_date, created_at')
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true }); // oldest-waiting first — the ones most overdue for follow-up surface first

  if (profile && profile.role !== 'CEO' && profile.branch_ids.length > 0) {
    referralsQuery = referralsQuery.in('branch_id', profile.branch_ids);
  }

  const { data: rows } = await referralsQuery;
  const referrals = (rows ?? []) as ReferralRow[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">הפניות</h1>
          <p className="text-sm text-stone-500 mt-1">הפניות שהתקבלו מחברות ביטוח, ממתינות לתיאום/קליטת הרכב</p>
        </div>
        <div className="flex items-center gap-3">
          {referrals.length > 0 && (
            <span className="px-4 py-2 bg-accent-soft text-accent-text rounded-full text-sm font-semibold">
              {referrals.length} הפניות פעילות
            </span>
          )}
          <NewReferralButton branchIds={profile?.branch_ids ?? []} isCeo={profile?.role === 'CEO'} />
        </div>
      </div>

      <ReferralsGrid referrals={referrals} branches={branches} branchNameById={branchNameById} />
    </div>
  );
}
