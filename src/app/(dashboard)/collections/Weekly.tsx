'use client';

import Link from 'next/link';
import type { CollectorWeek, WeeklyCase, WeeklySummary } from '@/lib/collectionsWeekly.server';
import { formatDate } from '@/lib/dates';
import { ils } from './shared';

// "📊 סיכום שבועי" (Amit, 14/10) — the same numbers that go to Amit and Chani
// every Sunday at 08:00, live.

const COLS: [keyof CollectorWeek, string, boolean?][] = [
  ['open', 'תיקים פתוחים'],
  ['openAmount', 'סכום פתוח', true],
  ['receivedCount', 'נגבו השבוע (תיקים)'],
  ['receivedAmount', 'נגבה השבוע', true],
  ['opened', 'נפתחו השבוע'],
  ['overdue', 'באיחור לפי צפי'],
  ['checksPast', 'צ׳קים שעבר מועדם'],
  ['stuck', 'תקועים 14+ יום'],
  ['lateReminders', 'תזכורות שלא בוצעו'],
];

function CaseList({ title, items }: { title: string; items: WeeklyCase[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-1">
      <p className="font-bold text-sm">{title}</p>
      {items.map((c) => (
        <Link key={c.id} href={`/collections/${c.id}`} className="flex justify-between gap-2 text-sm py-1 border-b border-gray-100 last:border-0">
          <span>
            <span className="font-semibold text-indigo-700">{c.plate}</span> · {c.customer_name ?? ''} · {c.payer}
            <span className="block text-[11px] text-gray-500">{c.collector} · {c.detail}</span>
          </span>
          <span className="font-semibold whitespace-nowrap">{ils(c.amount)}</span>
        </Link>
      ))}
    </div>
  );
}

export function WeeklyView({ s }: { s: WeeklySummary }) {
  const rows = [...s.rows, s.total];
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        שבוע {formatDate(s.from)} – {formatDate(s.to)} · נשלח לעמית ולחני בכל יום ראשון ב-08:00 (פעמון + פוש)
      </p>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => (
          <div key={r.id} className={`rounded-xl border p-3 ${r.id === 'total' ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
            <p className="font-bold mb-1">{r.name}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
              {COLS.map(([k, label, money]) => (
                <div key={k} className="contents">
                  <dt className="text-gray-500">{label}:</dt>
                  <dd className={`font-semibold ${(k === 'stuck' || k === 'overdue' || k === 'checksPast' || k === 'lateReminders') && r[k] ? 'text-red-700' : ''}`}>{money ? ils(Number(r[k])) : r[k]}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <CaseList title="⏰ באיחור לפי צפי (הגדולים)" items={s.overdue} />
        <CaseList title="🧾 צ׳קים שעבר מועד פירעונם" items={s.checksPast} />
        <CaseList title="🐌 תקועים — 14+ יום בלי רישום בתיק" items={s.stuck} />
      </div>
    </div>
  );
}
