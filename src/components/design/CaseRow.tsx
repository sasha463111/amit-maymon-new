'use client';

import { MapPin, ChevronLeft, Lock } from 'lucide-react';
import { LicensePlate } from '@/components/ui/LicensePlate';
import { StatusBadge, type CaseStatus } from './StatusBadge';

/** One repair case in the list rail. The ACTIVE STEP is the most prominent
 *  element (what a manager scans for). Composes LicensePlate + StatusBadge. */
export function CaseRow({
  plate,
  customer,
  insurer,
  branch,
  activeStep,
  status,
  selected = false,
  onClick,
}: {
  plate: string;
  customer: string;
  insurer: string;
  branch: string;
  activeStep: string;
  status: CaseStatus;
  selected?: boolean;
  onClick?: () => void;
}) {
  const done = status === 'done';
  const blocked = status === 'blocked';
  const pillTone = blocked ? 'bg-status-blocked-soft text-status-blocked-text' : 'bg-accent-soft text-accent-text';
  const pillDot = blocked ? 'bg-status-blocked' : 'bg-accent';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-right flex flex-col gap-3 p-4 rounded-lg border-[1.5px] transition-all ${
        selected
          ? 'bg-accent-soft border-accent shadow-md'
          : 'bg-white border-stone-200 hover:border-stone-300 shadow-xs hover:shadow-sm'
      }`}
    >
      {/* identity + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[17px] leading-tight text-stone-900 truncate">{customer || '—'}</div>
          {insurer && <div className="text-[13px] text-stone-500 mt-0.5 truncate">{insurer}</div>}
        </div>
        <StatusBadge status={status} size="sm" />
      </div>

      {/* plate */}
      <LicensePlate plate={plate} size="md" />

      {/* active step + branch */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-stone-200">
        {!done ? (
          <span className={`inline-flex items-center gap-2 min-w-0 rounded-full pr-1 pl-3 py-[5px] ${pillTone}`}>
            <span className="text-[11px] font-semibold opacity-70 tracking-wide shrink-0">השלב הבא</span>
            <span className="font-bold text-sm truncate">{activeStep}</span>
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-accent-on shrink-0 ${pillDot}`}>
              {blocked ? <Lock size={12} strokeWidth={2.25} /> : <ChevronLeft size={13} strokeWidth={2.5} />}
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-semibold text-sm text-status-done-text">הושלם</span>
        )}
        <span className="inline-flex items-center gap-1 text-stone-500 font-medium text-[13px] shrink-0">
          <MapPin size={14} strokeWidth={2} /> {branch}
        </span>
      </div>
    </button>
  );
}
