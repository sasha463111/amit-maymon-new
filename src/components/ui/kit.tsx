'use client';

// The shared design kit (Tomer, 15/10 — "עיצוב אחיד"): one stat card, one
// section frame, one branch filter and one small daily-activity chart, used by
// the dashboards first and then by the module screens (returns, claims…), so
// every screen looks and reads the same.

import Link from 'next/link';

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';
const TONE: Record<Tone, string> = {
  neutral: 'text-gray-900',
  good: 'text-green-700',
  warn: 'text-amber-700',
  bad: 'text-red-700',
  info: 'text-indigo-700',
};
const RING: Record<Tone, string> = {
  neutral: 'border-gray-200',
  good: 'border-green-200',
  warn: 'border-amber-300',
  bad: 'border-red-300',
  info: 'border-indigo-200',
};

/** A number with its label — and, optionally, a hint line and a link / action. */
export function StatCard({ label, value, hint, tone = 'neutral', href, onClick, active = false }: { label: string; value: string | number; hint?: string; tone?: Tone; href?: string; onClick?: () => void; active?: boolean }) {
  const inner = (
    <>
      <span className="block text-xs text-gray-500">{label}</span>
      <span className={`block text-2xl font-black leading-tight ${TONE[tone]}`}>{value}</span>
      {hint && <span className="block text-[11px] text-gray-500 mt-0.5">{hint}</span>}
    </>
  );
  const cls = `rounded-xl border-2 bg-white p-3 text-right ${active ? 'border-gray-900 ring-1 ring-gray-900' : RING[tone]}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${cls} hover:bg-gray-50 block w-full`}>
        {inner}
      </button>
    );
  }
  return href ? (
    <Link href={href} className={`${cls} hover:bg-gray-50 block`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{children}</div>;
}

/** A titled block of a screen. */
export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-bold text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** "הכל / אשקלון / נתיבות" — the same branch filter everywhere. */
export function BranchFilter({ branches, value, onChange }: { branches: { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  const opts = [{ id: '', name: 'כל הסניפים' }, ...branches];
  return (
    <div className="inline-flex rounded-xl border border-gray-300 bg-white p-0.5">
      {opts.map((b) => (
        <button
          key={b.id || 'all'}
          type="button"
          onClick={() => onChange(b.id)}
          className={`h-8 px-3 rounded-lg text-xs font-semibold ${value === b.id ? 'bg-gray-900 text-white' : 'text-gray-700'}`}
        >
          {b.name}
        </button>
      ))}
    </div>
  );
}

/** A short list "label — value" (top suppliers, stages, collectors…). */
export function RankList({ items, empty = 'אין נתונים', format }: { items: { label: string; value: number; hint?: string }[]; empty?: string; format?: (n: number) => string }) {
  if (!items.length) return <p className="text-sm text-gray-400">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-gray-800 truncate">{i.label}</span>
            <span className="font-bold text-gray-900 shrink-0">{format ? format(i.value) : i.value}</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 mt-0.5">
            <div className="h-1.5 rounded-full bg-indigo-400" style={{ width: `${Math.max(4, (i.value / max) * 100)}%` }} />
          </div>
          {i.hint && <span className="text-[11px] text-gray-500">{i.hint}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Daily activity — one bar per day (oldest → today), with the day under it. */
export function DayBars({ days, label }: { days: { date: string; value: number }[]; label: string }) {
  const max = Math.max(...days.map((d) => d.value), 1);
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-end gap-1 h-20" dir="ltr">
        {days.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.date.split('-').reverse().slice(0, 2).join('/')}: ${d.value}`}>
            <span className="text-[9px] text-gray-500">{d.value || ''}</span>
            <div className={`w-full rounded-t ${d.value ? 'bg-indigo-400' : 'bg-gray-100'}`} style={{ height: `${Math.max(3, (d.value / max) * 64)}px` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-0.5" dir="ltr">
        {days.map((d, i) => (
          <span key={d.date} className="flex-1 text-center text-[9px] text-gray-400">
            {i % 2 === days.length % 2 ? d.date.slice(8, 10) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

export const ils = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;
