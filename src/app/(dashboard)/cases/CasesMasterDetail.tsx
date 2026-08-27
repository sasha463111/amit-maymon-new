'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { CaseRow } from '@/components/design/CaseRow';
import { SegmentedControl } from '@/components/design/SegmentedControl';
import { SearchField } from '@/components/design/SearchField';
import { CreateCaseButton } from './CreateCaseButton';
import type { CaseStatus } from '@/components/design/StatusBadge';

export interface RailCase {
  id: string;
  plate: string;
  customer_name: string | null;
  insurer: string | null;
  branch_id: string;
  nextStep: string | null;
  approvalBlocked: boolean;
  hasExtrasInTreatment: boolean;
  hasCeoRejection: boolean;
}

function caseStatus(c: RailCase): CaseStatus {
  if (!c.nextStep) return 'done';
  // A CEO rejection is a distinct, more urgent state than "still waiting on
  // approval" — it needs someone to actually act (fix and resubmit), not just
  // wait. Checked before the generic approvalBlocked so it wins the color.
  if (c.hasCeoRejection) return 'rejected';
  if (c.approvalBlocked || c.hasExtrasInTreatment) return 'blocked';
  return 'active';
}

export function CasesMasterDetail({
  cases,
  branches,
  branchNameById,
  canCreate,
  branchId,
  isCeo,
  children,
}: {
  cases: RailCase[];
  branches: { id: string; name: string }[];
  branchNameById: Record<string, string>;
  canCreate: boolean;
  branchId: string | null;
  isCeo: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [branchFilter, setBranchFilter] = useState('all');
  const [query, setQuery] = useState('');

  // A case detail is open when the path is /cases/<id> (not the index, not archive).
  const seg = pathname.split('/').filter(Boolean); // ['cases', '<id>']
  const isArchive = seg[1] === 'archive';
  const selectedId = seg[0] === 'cases' && seg[1] && !isArchive ? seg[1] : null;
  const onDetail = !!selectedId;

  const filtered = useMemo(() => {
    const q = query.trim();
    return cases.filter((c) => {
      const okBranch = branchFilter === 'all' || c.branch_id === branchFilter;
      const okQuery =
        !q ||
        [c.plate, c.customer_name ?? '', c.insurer ?? ''].some((f) => f.includes(q));
      return okBranch && okQuery;
    });
  }, [cases, branchFilter, query]);

  const showBranchFilter = branches.length > 1;

  // The archive is a standalone full-width view — no master-detail rail.
  if (isArchive) return <>{children}</>;

  return (
    <div className="flex flex-col md:flex-row gap-4 md:h-[calc(100dvh-8.5rem)]">
      {/* List rail */}
      <aside
        className={`${onDetail ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[336px] lg:w-[368px] shrink-0 md:h-full min-h-0`}
      >
        {/* rail header */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-bold text-stone-900">תיקים</h1>
            <span className="text-sm font-medium text-stone-500">{filtered.length} פתוחים</span>
          </div>
          {canCreate && <CreateCaseButton branchId={branchId} isCeo={isCeo} />}
        </div>

        <div className="mb-3">
          <SearchField value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        {showBranchFilter && (
          <div className="mb-3">
            <SegmentedControl
              options={[{ value: 'all', label: 'הכל' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
              value={branchFilter}
              onChange={setBranchFilter}
            />
          </div>
        )}

        {/* rows */}
        <div className="flex-1 min-h-0 md:overflow-y-auto flex flex-col gap-2.5 pb-2 -mx-0.5 px-0.5">
          {filtered.length === 0 && (
            <div className="py-12 text-center text-stone-500 text-sm">לא נמצאו תיקים תואמים</div>
          )}
          {filtered.map((c) => (
            <CaseRow
              key={c.id}
              plate={c.plate}
              customer={c.customer_name ?? ''}
              insurer={c.insurer ?? ''}
              branch={branchNameById[c.branch_id] ?? ''}
              activeStep={c.nextStep ?? ''}
              status={caseStatus(c)}
              selected={c.id === selectedId}
              onClick={() => router.push(`/cases/${c.id}`)}
            />
          ))}
        </div>
      </aside>

      {/* Detail pane */}
      <section
        className={`${onDetail ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0 md:h-full md:overflow-y-auto bg-white md:rounded-xl md:border md:border-stone-200 md:shadow-sm`}
      >
        {children}
      </section>
    </div>
  );
}
