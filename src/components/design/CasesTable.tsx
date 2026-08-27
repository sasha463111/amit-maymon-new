'use client';

import { LicensePlate } from '@/components/ui/LicensePlate';
import { StatusBadge, type CaseStatus } from './StatusBadge';

export interface TableCase {
  id: string;
  plate: string;
  customer: string;
  insurer: string;
  branch: string;
  activeStep: string;
  status: CaseStatus;
}

/** Full-width, one-line-per-case view for browsing many open cases at once —
 *  the dense alternative to the card rail, for branches routinely running
 *  30–40 open cases where a card list means constant scrolling. Rows are
 *  pre-sorted by urgency by the caller; this just renders them. */
export function CasesTable({ rows, onRowClick }: { rows: TableCase[]; onRowClick: (id: string) => void }) {
  if (rows.length === 0) {
    return <div className="py-16 text-center text-stone-500 text-sm">לא נמצאו תיקים תואמים</div>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-xs">
      <table className="w-full text-sm border-collapse min-w-[720px]">
        <thead>
          <tr className="border-b border-stone-200">
            <th className="text-right font-semibold text-[11px] text-stone-500 px-3 py-2.5 whitespace-nowrap">סטטוס</th>
            <th className="text-right font-semibold text-[11px] text-stone-500 px-3 py-2.5 whitespace-nowrap">לוחית</th>
            <th className="text-right font-semibold text-[11px] text-stone-500 px-3 py-2.5 whitespace-nowrap">לקוח</th>
            <th className="text-right font-semibold text-[11px] text-stone-500 px-3 py-2.5 whitespace-nowrap">מבטח</th>
            <th className="text-right font-semibold text-[11px] text-stone-500 px-3 py-2.5 whitespace-nowrap">סניף</th>
            <th className="text-right font-semibold text-[11px] text-stone-500 px-3 py-2.5 whitespace-nowrap">השלב הבא</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const done = r.status === 'done';
            const rowTone =
              r.status === 'rejected'
                ? 'bg-status-rejected-soft/40 hover:bg-status-rejected-soft/60'
                : r.status === 'waiting'
                  ? 'bg-status-waiting-soft/40 hover:bg-status-waiting-soft/60'
                  : done
                    ? 'opacity-60 hover:opacity-80'
                    : 'hover:bg-stone-50';
            return (
              <tr
                key={r.id}
                onClick={() => onRowClick(r.id)}
                className={`border-b border-stone-100 last:border-0 cursor-pointer transition-colors ${rowTone}`}
              >
                <td className="px-3 py-2 whitespace-nowrap">
                  <StatusBadge status={r.status} size="sm" />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <LicensePlate plate={r.plate} size="sm" />
                </td>
                <td className="px-3 py-2 whitespace-nowrap font-bold text-stone-900">{r.customer || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-stone-500">{r.insurer || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-stone-500">{r.branch || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-stone-700">{done ? 'הושלם' : r.activeStep || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
