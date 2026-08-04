'use client';

import { Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { BlockersBadges } from '@/components/ui/BlockersBadges';
import type { PartsStatus } from '@/types/database';

interface CaseRow {
  id: string;
  case_key?: string | null;
  plate: string;
  claim: string;
  customer_name?: string | null;
  opened_at: string | null;
  age: string;
  parts_status: PartsStatus;
  general_status: string;
  hasExtrasInTreatment: boolean;
  approvalBlocked: boolean;
  nextStep: string | null;
  activeStepKey?: string | null;
  notes: string | null;
  painter_status?: string | null;
}

// Israeli plate grouping: 8 digits -> 3-3-2, 7 digits -> 2-3-2.
function groupPlate(plate: string): string[] {
  const d = String(plate ?? '').replace(/\D/g, '');
  if (d.length === 8) return [d.slice(0, 3), d.slice(3, 6), d.slice(6)];
  if (d.length === 7) return [d.slice(0, 2), d.slice(2, 5), d.slice(5)];
  return [d || String(plate ?? '')];
}

/** Design-system Plate chip: the most legible object in a row. */
function PlateChip({ number, size = 'md' }: { number: string; size?: 'sm' | 'md' }) {
  const groups = groupPlate(number);
  return (
    <span
      dir="ltr"
      className={`inline-flex items-center gap-1.5 bg-white border-[1.5px] border-stone-400 rounded shrink-0 align-middle whitespace-nowrap font-bold text-stone-900 tabular plate-track ${
        size === 'sm' ? 'px-2 py-0.5 text-sm' : 'px-2.5 py-1 text-[15px]'
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-[2px] bg-accent shrink-0" />
      {groups.map((g, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="text-stone-400 font-normal">·</span>}
          <span>{g}</span>
        </Fragment>
      ))}
    </span>
  );
}

export function CasesTable({
  cases,
  role,
}: {
  cases: CaseRow[];
  role: string | null;
}) {
  const router = useRouter();
  const columns: Column<CaseRow>[] = [
    { key: 'plate', label: 'מספר רישוי', render: (row) => <PlateChip number={row.plate} /> },
    { key: 'claim', label: 'תביעה' },
    {
      key: 'customer_name',
      label: 'לקוח',
      render: (row) => (
        <span className="text-sm text-gray-800 font-semibold">{row.customer_name ?? '—'}</span>
      ),
    },
    {
      key: 'opened_at',
      label: 'נפתח',
      render: (row) =>
        row.opened_at
          ? new Date(row.opened_at).toLocaleDateString('he-IL')
          : '—',
    },
    { key: 'age', label: 'גיל רכב' },
    { key: 'parts_status', label: 'חלקים' },
    {
      key: 'nextStep',
      label: 'השלב הבא',
      // The active step is what a manager scans for — petrol (the "active" status).
      render: (row) =>
        row.nextStep ? (
          <span className="inline-flex items-center gap-2 pl-3 pr-1 py-1 bg-accent-soft text-accent-text rounded-full text-xs font-bold whitespace-nowrap">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-accent-on shrink-0">
              <ChevronLeft size={13} strokeWidth={2.5} />
            </span>
            {row.nextStep}
          </span>
        ) : (
          <span className="text-status-done-text text-xs font-semibold">הושלם</span>
        ),
    },
    {
      key: 'notes',
      label: '',
      render: (row) =>
        row.notes ? (
          <span
            title={row.notes}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-red text-white text-[10px] font-bold cursor-default"
            aria-label="יש הערה"
          >
            !
          </span>
        ) : null,
    },
    {
      key: 'blockers',
      label: 'חסימות',
      render: (row) => (
        <BlockersBadges
          partsStatus={row.parts_status}
          hasExtrasInTreatment={row.hasExtrasInTreatment}
          approvalBlocked={row.approvalBlocked}
        />
      ),
    },
  ];

  return (
    <DataTable<CaseRow>
      columns={columns}
      data={cases}
      searchPlaceholder="חיפוש רישוי, תביעה, שם לקוח..."
      searchKeys={['plate', 'claim', 'customer_name']}
      rowKey={(row) => row.id}
      onRowClick={(row) => router.push(`/cases/${row.id}`)}
      mobileHeadline={(row) => (
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-stone-900">{row.customer_name || row.plate}</span>
          {row.notes && (
            <span
              title={row.notes}
              className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-red text-white text-[10px] font-bold shrink-0"
              aria-label="יש הערה"
            >
              !
            </span>
          )}
        </div>
      )}
      mobileSubheadline={(row) => (
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          <PlateChip number={row.plate} size="sm" />
          {row.nextStep && (
            <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-0.5 bg-accent-soft text-accent-text rounded-full text-[11px] font-bold whitespace-nowrap">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent text-accent-on shrink-0">
                <ChevronLeft size={11} strokeWidth={2.5} />
              </span>
              {row.nextStep}
            </span>
          )}
        </div>
      )}
    />
  );
}
