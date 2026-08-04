import { Check, Play, Clock, ChevronsLeft, Lock, X } from 'lucide-react';

export type CaseStatus = 'done' | 'active' | 'waiting' | 'skipped' | 'blocked' | 'rejected';

const MAP: Record<CaseStatus, { label: string; Icon: typeof Check; cls: string }> = {
  done: { label: 'בוצע', Icon: Check, cls: 'bg-status-done-soft text-status-done-text' },
  active: { label: 'פעיל', Icon: Play, cls: 'bg-accent-soft text-accent-text' },
  waiting: { label: 'ממתין', Icon: Clock, cls: 'bg-status-waiting-soft text-status-waiting-text' },
  skipped: { label: 'דולג', Icon: ChevronsLeft, cls: 'bg-status-skipped-soft text-status-skipped-text' },
  blocked: { label: 'חסום', Icon: Lock, cls: 'bg-status-blocked-soft text-status-blocked-text' },
  rejected: { label: 'נדחה', Icon: X, cls: 'bg-status-rejected-soft text-status-rejected-text' },
};

/** The canonical semantic status pill — one of six fixed states, each with its
 *  own hue AND icon (survives bad shop lighting / color-blindness). */
export function StatusBadge({ status = 'active', size = 'md' }: { status?: CaseStatus; size?: 'sm' | 'md' }) {
  const s = MAP[status] ?? MAP.active;
  const sm = size === 'sm';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ${sm ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'} ${s.cls}`}>
      <s.Icon size={sm ? 13 : 15} strokeWidth={2.25} />
      {s.label}
    </span>
  );
}
