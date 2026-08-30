'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { LicensePlate } from '@/components/ui/LicensePlate';
import { SegmentedControl } from '@/components/design/SegmentedControl';
import { INSURANCE_TYPE_LABELS } from '@/types/database';

const PARTS_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  AVAILABLE: { label: 'חלקים זמינים', color: 'text-green-700 bg-green-50 border-green-200' },
  ORDERED: { label: 'חלקים הוזמנו', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  NO_PARTS: { label: 'אין חלקים', color: 'text-red-700 bg-red-50 border-red-200' },
  AIRMAIL_PENDING: { label: 'ממתין לדואר אוויר', color: 'text-blue-700 bg-blue-50 border-blue-200' },
};

export interface ClosureCaseRow {
  id: string;
  case_key: string | null;
  customer_name: string | null;
  branch_id: string;
  opened_at: string | null;
  parts_status: string | null;
  insurance_type: string | null;
  insurance_company: string | null;
  license_plate: string | null;
  make: string | null;
  model: string | null;
  branch_name: string | null;
}

/** Branch filter tabs (הכל / נתיבות / אשקלון) — same pattern and component
 *  as the main cases list, requested so a CEO looking at closure can narrow
 *  to one branch instead of always seeing everyone's cases mixed together. */
export function ClosureCasesGrid({
  cases,
  branches,
}: {
  cases: ClosureCaseRow[];
  branches: { id: string; name: string }[];
}) {
  const [branchFilter, setBranchFilter] = useState('all');
  const showBranchFilter = branches.length > 1;

  const filtered = useMemo(
    () => (branchFilter === 'all' ? cases : cases.filter((c) => c.branch_id === branchFilter)),
    [cases, branchFilter]
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
          <h3 className="text-lg font-semibold text-stone-700 mb-1">אין תיקים לסגירה</h3>
          <p className="text-stone-400 text-sm">כשתיקים יסיימו את שלב העבודה הם יופיעו כאן</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((row) => {
            const parts = row.parts_status ? PARTS_STATUS_LABELS[row.parts_status] : null;
            const daysOpen = row.opened_at
              ? Math.floor((Date.now() - new Date(row.opened_at).getTime()) / 86400000)
              : null;

            return (
              <Link key={row.id} href={`/closure/${row.id}`} className="block group h-full">
                <div className="h-full flex flex-col gap-3 bg-white rounded-xl border-[1.5px] border-stone-200 shadow-xs p-4 hover:border-accent/50 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-stone-900 truncate">
                      {row.customer_name ?? row.case_key ?? row.license_plate ?? row.id}
                    </h3>
                    {row.insurance_type && (
                      <span className="shrink-0 px-2 py-0.5 bg-stone-100 text-stone-600 rounded text-[11px] font-medium">
                        {INSURANCE_TYPE_LABELS[row.insurance_type] ?? row.insurance_type}
                      </span>
                    )}
                  </div>

                  {row.license_plate && <LicensePlate plate={row.license_plate} size="sm" />}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-stone-500">
                    {row.make && <span>{row.make} {row.model}</span>}
                    {row.insurance_company && <span>🏢 {row.insurance_company}</span>}
                    {row.branch_name && <span>📍 {row.branch_name}</span>}
                  </div>

                  <div className="flex-1" />

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {parts && (
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${parts.color}`}>
                          {parts.label}
                        </span>
                      )}
                      {daysOpen !== null && (
                        <span className={`text-[11px] font-medium ${daysOpen > 14 ? 'text-status-rejected-text' : daysOpen > 7 ? 'text-status-waiting-text' : 'text-stone-400'}`}>
                          ⏱ {daysOpen} ימים
                        </span>
                      )}
                    </div>
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
