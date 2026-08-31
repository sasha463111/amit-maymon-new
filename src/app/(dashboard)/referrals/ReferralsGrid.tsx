'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { LicensePlate } from '@/components/ui/LicensePlate';
import { SegmentedControl } from '@/components/design/SegmentedControl';

export interface ReferralRow {
  id: string;
  branch_id: string;
  customer_name: string | null;
  insurance_company: string | null;
  plate_number: string | null;
  status_note: string | null;
  current_status_tag: string | null;
  follow_up_date: string | null;
  created_at: string;
}

/** Branch filter tabs (הכל / נתיבות / אשקלון) — same pattern as /cases and
 *  /closure, requested so a CEO looking at referrals can narrow to one
 *  branch instead of always seeing both mixed together. */
export function ReferralsGrid({
  referrals,
  branches,
  branchNameById,
}: {
  referrals: ReferralRow[];
  branches: { id: string; name: string }[];
  branchNameById: Map<string, string>;
}) {
  const [branchFilter, setBranchFilter] = useState('all');
  const showBranchFilter = branches.length > 1;

  const filtered = useMemo(
    () => (branchFilter === 'all' ? referrals : referrals.filter((r) => r.branch_id === branchFilter)),
    [referrals, branchFilter]
  );

  return (
    <div className="space-y-4">
      {showBranchFilter && (
        <SegmentedControl
          options={[{ value: 'all', label: 'הכל' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
          value={branchFilter}
          onChange={setBranchFilter}
        />
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-stone-200 shadow-sm">
          <div className="text-5xl mb-4">📭</div>
          <h3 className="text-lg font-semibold text-stone-700 mb-1">אין הפניות פעילות</h3>
          <p className="text-stone-400 text-sm">הפניות חדשות שתקלטו יופיעו כאן</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((r) => {
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
