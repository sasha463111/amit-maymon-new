import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LicensePlate } from '@/components/ui/LicensePlate';
import { NewReferralButton } from './NewReferralButton';

export default async function ReferralsPage() {
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
        <h1 className="text-2xl font-bold mb-4">הפניות</h1>
        <p className="text-gray-500">אין גישה לדף זה.</p>
      </div>
    );
  }

  const { data: branches } = await supabase.from('branches').select('id, name');
  const branchNameById = new Map(((branches ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));

  let referralsQuery = supabase
    .from('referrals')
    .select('id, branch_id, customer_name, insurance_company, plate_number, status_note, current_status_tag, follow_up_date, created_at')
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true }); // oldest-waiting first — the ones most overdue for follow-up surface first

  if (profile && profile.role !== 'CEO' && profile.branch_id) {
    referralsQuery = referralsQuery.eq('branch_id', profile.branch_id);
  }

  const { data: rows } = await referralsQuery;

  const referrals = (rows ?? []) as {
    id: string;
    branch_id: string;
    customer_name: string | null;
    insurance_company: string | null;
    plate_number: string | null;
    status_note: string | null;
    current_status_tag: string | null;
    follow_up_date: string | null;
    created_at: string;
  }[];

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
          <NewReferralButton branchId={profile?.branch_id ?? null} isCeo={profile?.role === 'CEO'} />
        </div>
      </div>

      {referrals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-stone-200 shadow-sm">
          <div className="text-5xl mb-4">📭</div>
          <h3 className="text-lg font-semibold text-stone-700 mb-1">אין הפניות פעילות</h3>
          <p className="text-stone-400 text-sm">הפניות חדשות שתקלטו יופיעו כאן</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {referrals.map((r) => {
            const daysWaiting = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000);
            // Explicit request: flag a referral waiting on paperwork with no
            // case opened yet (query is already status='ACTIVE' only) in
            // yellow so it stands out from the rest of the active list.
            const awaitingPaperwork = r.current_status_tag === 'AWAITING_PAPERWORK';
            return (
              <Link key={r.id} href={`/referrals/${r.id}`} className="block group h-full">
                <div className={`h-full flex flex-col gap-3 rounded-xl border-[1.5px] shadow-xs p-4 hover:shadow-sm transition-all ${
                  awaitingPaperwork
                    ? 'bg-amber-50 border-amber-300 hover:border-amber-400'
                    : 'bg-white border-stone-200 hover:border-accent/50'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-stone-900 truncate">
                      {r.customer_name ?? 'ללא שם לקוח'}
                    </h3>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {awaitingPaperwork && (
                        <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded text-[11px] font-semibold">
                          ⏳ ממתין לניירת
                        </span>
                      )}
                      {r.insurance_company && (
                        <span className="px-2 py-0.5 bg-stone-100 text-stone-600 rounded text-[11px] font-medium">
                          {r.insurance_company}
                        </span>
                      )}
                    </div>
                  </div>

                  {r.plate_number && <LicensePlate plate={r.plate_number} size="sm" />}

                  {r.status_note && (
                    <p className="text-[12.5px] text-stone-500 line-clamp-2">📝 {r.status_note}</p>
                  )}

                  {r.follow_up_date && (
                    <span className="self-start px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[11px] font-medium">
                      📅 תזכורת: {new Date(r.follow_up_date).toLocaleDateString('he-IL')}
                    </span>
                  )}

                  <div className="flex-1" />

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
                    <span className={`text-[11px] font-medium ${daysWaiting > 3 ? 'text-status-rejected-text' : daysWaiting > 1 ? 'text-status-waiting-text' : 'text-stone-400'}`}>
                      ⏱ {daysWaiting} ימים מקבלת ההפנייה · {branchNameById.get(r.branch_id) ?? '—'}
                    </span>
                    <span className="text-accent-text text-[12.5px] font-semibold group-hover:underline shrink-0">
                      פתח ←
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
