'use client';

import { LicensePlate } from '@/components/ui/LicensePlate';
import type { CaseStatus } from './StatusBadge';

const DOT_TONE: Record<CaseStatus, string> = {
  rejected: 'bg-status-rejected',
  blocked: 'bg-status-blocked',
  waiting: 'bg-status-waiting',
  active: 'bg-accent',
  skipped: 'bg-stone-300',
  done: 'bg-status-done',
};

const ROW_TONE: Record<CaseStatus, string> = {
  rejected: 'bg-status-rejected-soft/40 border-status-rejected/40',
  blocked: 'bg-status-blocked-soft/40 border-status-blocked/40',
  waiting: 'bg-status-waiting-soft/40 border-status-waiting/40',
  active: 'bg-white border-stone-200',
  skipped: 'bg-white border-stone-200',
  done: 'bg-white border-stone-200 opacity-60',
};

/** One-line-per-case row for phones — same urgency color language as the
 *  desktop table and the full CaseRow card, just collapsed to a single line
 *  so scanning 30-40 open cases doesn't mean constant scrolling on a small
 *  screen the way the full multi-line card did. */
export function CompactCaseRow({
  plate,
  customer,
  activeStep,
  branch,
  status,
  onClick,
}: {
  plate: string;
  customer: string;
  activeStep: string;
  branch: string;
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
      <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_TONE[status]}`} />
      <LicensePlate plate={plate} size="sm" />
      <span className="flex-1 min-w-0 flex flex-col">
        <span className="font-bold text-[13px] text-stone-900 truncate leading-tight">{customer || '—'}</span>
        <span className="text-[11px] text-stone-500 truncate leading-tight">{done ? 'הושלם' : activeStep || '—'}</span>
      </span>
      <span className="text-[11px] text-stone-400 shrink-0">{branch}</span>
    </button>
  );
}
