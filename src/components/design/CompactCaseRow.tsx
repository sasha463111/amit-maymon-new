'use client';

import { LicensePlate } from '@/components/ui/LicensePlate';
import { StatusBadge, type CaseStatus } from './StatusBadge';

// Full-row tint per status — solid soft tokens (not diluted with opacity),
// plus a colored trailing border as a stronger "flag" than a small dot can
// be at a glance. Clears back to plain white the moment the underlying
// signal clears (unread notification read, or CEO decision no longer
// REJECTED) — this just renders whatever caseStatus() already computed.
const ROW_TONE: Record<CaseStatus, string> = {
  rejected: 'bg-status-rejected-soft border-status-rejected/60 border-r-4',
  blocked: 'bg-status-blocked-soft border-status-blocked/60 border-r-4',
  waiting: 'bg-status-waiting-soft border-status-waiting/60 border-r-4',
  active: 'bg-white border-stone-200',
  skipped: 'bg-white border-stone-200',
  done: 'bg-white border-stone-200 opacity-60',
};

/** One-line-per-case row for phones — same urgency color language as the
 *  desktop table and the full CaseRow card, collapsed to a single line so
 *  scanning 30-40 open cases doesn't mean constant scrolling. The branch
 *  name (redundant once the branch tabs above already filter to one) is
 *  replaced with the status badge — that's the thing actually worth a
 *  glance per row. */
export function CompactCaseRow({
  plate,
  customer,
  activeStep,
  status,
  onClick,
}: {
  plate: string;
  customer: string;
  activeStep: string;
  status: CaseStatus;
  onClick?: () => void;
}) {
  const done = status === 'done';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 text-right px-3 py-2.5 rounded-lg border-[1.5px] transition-colors ${ROW_TONE[status]}`}
    >
      <LicensePlate plate={plate} size="sm" />
      <span className="flex-1 min-w-0 flex flex-col">
        <span className="font-bold text-[13px] text-stone-900 truncate leading-tight">{customer || '—'}</span>
        <span className="text-[11px] text-stone-500 truncate leading-tight">{done ? 'הושלם' : activeStep || '—'}</span>
      </span>
      <StatusBadge status={status} size="sm" />
    </button>
  );
}
