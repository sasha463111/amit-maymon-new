'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { CaseRow } from '@/components/design/CaseRow';
import { CompactCaseRow } from '@/components/design/CompactCaseRow';
import { SegmentedControl } from '@/components/design/SegmentedControl';
import { SearchField } from '@/components/design/SearchField';
import { CreateCaseButton } from './CreateCaseButton';
import type { CaseStatus } from '@/components/design/StatusBadge';
import { matchesCaseQuery } from '@/lib/caseQuery';

// Sort order: by opening date, NEWEST first (Amit, 2026-10-07). History:
// urgency sort → oldest-first (2026-10-05) → newest-first, because with
// oldest-first a case opened this morning sat at the bottom of ~47 rows and
// staff read that as "the app isn't updating". Urgency is still shown by each
// row's color and badge; it does not decide the position.
function openedTime(c: RailCase): number {
  const t = c.opened_at ? new Date(c.opened_at).getTime() : NaN;
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t; // undated cases last
}

export interface RailCase {
  id: string;
  plate: string;
  /** "טויוטה C-HR HYBRID" — shown next to the plate (src/lib/vehicleLabel.ts). */
  vehicle?: string | null;
  opened_at: string | null;
  customer_name: string | null;
  insurer: string | null;
  branch_id: string;
  created_by: string | null;
  nextStep: string | null;
  approvalBlocked: boolean;
  hasExtrasInTreatment: boolean;
  hasCeoRejection: boolean;
  notifSeverity: 'red' | 'yellow' | null;
  unreadNotificationCount: number;
}

function caseStatus(c: RailCase): CaseStatus {
  if (!c.nextStep) return 'done';
  // A CEO rejection is a distinct, more urgent state than "still waiting on
  // approval" — it needs someone to actually act (fix and resubmit), not just
  // wait. A red-tier unread notification (e.g. BLOCKED_ACTION) is treated the
  // same way even without a formal rejection row. Checked first so it wins.
  if (c.hasCeoRejection || c.notifSeverity === 'red') return 'rejected';
  if (c.approvalBlocked || c.hasExtrasInTreatment) return 'blocked';
  // An unread amber-tier notification (painter request, approval needed, a
  // new extra) with nothing more urgent going on — flag it as "waiting" so
  // it's visible in the list without opening the notifications bell. Personal
  // per user: clears once you read the notification, even if others haven't.
  if (c.notifSeverity === 'yellow') return 'waiting';
  return 'active';
}

export function CasesMasterDetail({
  cases,
  branches,
  branchNameById,
  canCreate,
  branchIds = [],
  isCeo,
  mineFirstFor = null,
  children,
}: {
  cases: RailCase[];
  branches: { id: string; name: string }[];
  branchNameById: Record<string, string>;
  canCreate: boolean;
  branchIds?: string[];
  isCeo: boolean;
  /** User id: show a "שפתחתי" filter, on by default (office staff). */
  mineFirstFor?: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [branchFilter, setBranchFilter] = useState('all');
  const [mineOnly, setMineOnly] = useState(!!mineFirstFor);

  // Auto-refresh: <AutoRefresh /> in (dashboard)/layout.tsx covers every page.
  const [query, setQuery] = useState('');

  // A case detail is open when the path is /cases/<id> (not the index, not archive).
  const seg = pathname.split('/').filter(Boolean); // ['cases', '<id>']
  const isArchive = seg[1] === 'archive';
  const selectedId = seg[0] === 'cases' && seg[1] && !isArchive ? seg[1] : null;
  const onDetail = !!selectedId;

  const filtered = useMemo(() => {
    const q = query.trim();
    return cases
      .filter((c) => {
        const okBranch = branchFilter === 'all' || c.branch_id === branchFilter;
        if (mineOnly && mineFirstFor && c.created_by !== mineFirstFor) return false;
        const okQuery = matchesCaseQuery(q, [c.plate, c.customer_name, c.insurer, c.vehicle]);
        return okBranch && okQuery;
      })
      .sort((a, b) => openedTime(b) - openedTime(a));
  }, [cases, branchFilter, query, mineOnly, mineFirstFor]);

  const showBranchFilter = branches.length > 1;
  // Open cases per branch on each tab, total on "הכל" (2026-10-09) — same as
  // the referrals page.
  const branchOptions = [
    { value: 'all', label: `הכל (${cases.length})` },
    ...branches.map((b) => ({ value: b.id, label: `${b.name} (${cases.filter((c) => c.branch_id === b.id).length})` })),
  ];

  // The archive is a standalone full-width view — no master-detail rail.
  if (isArchive) return <>{children}</>;

  // Browsing (no case open): full-width dense table — the point of it is
  // seeing many rows without scrolling, which a narrow rail can't give.
  // Once a case is open, drop back to the classic narrow rail + detail split.
  if (!onDetail) {
    return (
      <div className="flex flex-col gap-4">
        {children}

        {/* Search right next to the title (Amit, 2026-10-13). It used to sit
            beside the branch tabs, whose w-full squeezed it to zero width —
            on a wide screen it simply wasn't there. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-baseline gap-2 shrink-0">
            <h1 className="text-xl font-bold text-stone-900">תיקים</h1>
            <span className="text-sm font-medium text-stone-500">{filtered.length} פתוחים</span>
          </div>
          <div className="order-last w-full sm:order-none sm:w-80 lg:w-96">
            <SearchField
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש: מספר רכב, לקוח, ביטוח או סוג רכב"
            />
          </div>
          <div className="mr-auto">{canCreate && <CreateCaseButton branchIds={branchIds} isCeo={isCeo} />}</div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {mineFirstFor && (
            <button
              type="button"
              onClick={() => setMineOnly((v) => !v)}
              className={`h-11 px-4 rounded-md border-[1.5px] text-sm font-semibold whitespace-nowrap ${
                mineOnly ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-300'
              }`}
            >
              {mineOnly ? '✓ תיקים שפתחתי' : 'תיקים שפתחתי'}
            </button>
          )}
          {showBranchFilter && (
            <SegmentedControl
              options={branchOptions}
              value={branchFilter}
              onChange={setBranchFilter}
            />
          )}
        </div>

        {/* Table needs real width to be readable (6 columns) — on a phone
            that means horizontal scrolling. Compact one-line rows instead —
            same urgency-sort and colors, condensed for a small screen rather
            than the full multi-line card, which meant just as much scrolling
            as the table would have. Table stays for md: and up. */}
        <div className="md:hidden flex flex-col gap-2">
          {filtered.length === 0 && (
            <div className="py-12 text-center text-stone-500 text-sm">לא נמצאו תיקים תואמים</div>
          )}
          {filtered.map((c) => (
            <CompactCaseRow
              key={c.id}
              plate={c.plate}
              vehicle={c.vehicle ?? ''}
              customer={c.customer_name ?? ''}
              activeStep={c.nextStep ?? ''}
              status={caseStatus(c)}
              openedAt={c.opened_at}
              unreadNotificationCount={c.unreadNotificationCount}
              onClick={() => router.push(`/cases/${c.id}`)}
            />
          ))}
        </div>

        {/* Desktop: a grid of case cards ("cubes, CRM style" — Amit,
            2026-10-07) instead of the dense table. Yellow card = has an
            unread notification for me; white = nothing waiting. */}
        <div className="hidden md:block">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-stone-500 text-sm">לא נמצאו תיקים תואמים</div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
              {filtered.map((c) => (
                <CaseRow
                  key={c.id}
                  plate={c.plate}
              vehicle={c.vehicle ?? ''}
                  customer={c.customer_name ?? ''}
                  insurer={c.insurer ?? ''}
                  branch={branchNameById[c.branch_id] ?? ''}
                  activeStep={c.nextStep ?? ''}
                  status={caseStatus(c)}
                  openedAt={c.opened_at}
                  onClick={() => router.push(`/cases/${c.id}`)}
                  unreadNotificationCount={c.unreadNotificationCount}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-4 md:h-[calc(100dvh-8.5rem)]">
      {/* List rail */}
      <aside className="flex flex-col w-full md:w-[336px] lg:w-[368px] shrink-0 md:h-full min-h-0 hidden md:flex">
        {/* rail header */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-bold text-stone-900">תיקים</h1>
            <span className="text-sm font-medium text-stone-500">{filtered.length} פתוחים</span>
          </div>
          {canCreate && <CreateCaseButton branchIds={branchIds} isCeo={isCeo} />}
        </div>

        <div className="mb-3">
          <SearchField value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        {showBranchFilter && (
          <div className="mb-3">
            <SegmentedControl
              options={branchOptions}
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
              vehicle={c.vehicle ?? ''}
              customer={c.customer_name ?? ''}
              insurer={c.insurer ?? ''}
              branch={branchNameById[c.branch_id] ?? ''}
              activeStep={c.nextStep ?? ''}
              status={caseStatus(c)}
              openedAt={c.opened_at}
              selected={c.id === selectedId}
              onClick={() => router.push(`/cases/${c.id}`)}
              unreadNotificationCount={c.unreadNotificationCount}
            />
          ))}
        </div>
      </aside>

      {/* Detail pane */}
      <section className="flex flex-col flex-1 min-w-0 md:h-full md:overflow-y-auto bg-white md:rounded-xl md:border md:border-stone-200 md:shadow-sm">
        {children}
      </section>
    </div>
  );
}
