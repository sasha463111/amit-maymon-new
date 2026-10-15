'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppRequest, RequestKind, RequestStatus } from '@/app/actions/appRequests';
import { Composer, RequestCard } from './RequestCard';

// "🐞 באגים" / "🚀 פיתוחים" (Tomer, 15/10) — every request of this kind from
// every user, with date and details; Tomer & Amit manage them (status,
// priority, re-tag, answer). Requests from before the tagging ("לא מסווג")
// show on both boards until they are tagged.

type Filter = 'open' | 'NEW' | 'IN_PROGRESS' | 'closed' | 'all';
const FILTERS: [Filter, string][] = [
  ['open', 'פתוחים'],
  ['NEW', '🆕 חדשים'],
  ['IN_PROGRESS', '🔧 בעבודה'],
  ['closed', 'סגורים'],
  ['all', 'הכל'],
];
const isOpen = (s: RequestStatus) => s === 'NEW' || s === 'IN_PROGRESS';

export function TicketsBoard({ kind, items }: { kind: RequestKind; items: AppRequest[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('open');
  const [person, setPerson] = useState('');
  const [hash, setHash] = useState('');
  const [adding, setAdding] = useState(false);
  useEffect(() => setHash(window.location.hash.slice(1)), []);

  const mine = items.filter((r) => r.kind === kind);
  const untagged = items.filter((r) => !r.kind && isOpen(r.status));
  const people = Array.from(new Set(mine.map((r) => r.by).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'he'));
  const shown = mine
    .filter((r) => (filter === 'open' ? isOpen(r.status) : filter === 'closed' ? !isOpen(r.status) : filter === 'all' ? true : r.status === filter))
    .filter((r) => !person || r.by === person)
    // Priority first (1 → 3, none last), then the newest.
    .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9) || b.created_at.localeCompare(a.created_at));

  const count = (f: Filter) => mine.filter((r) => (f === 'open' ? isOpen(r.status) : f === 'closed' ? !isOpen(r.status) : f === 'all' ? true : r.status === f)).length;
  const title = kind === 'BUG' ? '🐞 באגים' : '🚀 פיתוחים';

  return (
    <div className="max-w-4xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500">
            {kind === 'BUG' ? 'כל מה שהמשתמשים דיווחו שלא עובד' : 'כל הבקשות לפיתוח ושיפור מהמשתמשים'} — עם תאריך, מבקש ופירוט. מנהלים כאן: סטטוס, עדיפות, סוג ותשובה למבקש.
          </p>
        </div>
        <button type="button" onClick={() => setAdding(!adding)} className="h-10 px-4 rounded-xl bg-gray-900 text-white text-sm font-bold">
          {adding ? 'סגירה' : kind === 'BUG' ? '+ באג חדש' : '+ פיתוח חדש'}
        </button>
      </div>

      {adding && (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
          <Composer
            defaultKind={kind}
            onDone={() => {
              setAdding(false);
              router.refresh();
            }}
            placeholder={kind === 'BUG' ? 'מה לא עובד? איפה (מסך / כפתור), ומה קרה?' : 'מה להוסיף / לשפר?'}
            cta="שמירה"
          />
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {(
          [
            ['open', 'פתוחים', 'text-gray-900'],
            ['NEW', 'חדשים', 'text-blue-700'],
            ['IN_PROGRESS', 'בעבודה', 'text-amber-700'],
            ['closed', 'סגורים', 'text-green-700'],
          ] as const
        ).map(([f, l, tone]) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-xl border-2 bg-white p-3 text-right ${filter === f ? 'border-gray-900' : 'border-gray-200'}`}>
            <span className="block text-xs text-gray-500">{l}</span>
            <span className={`block text-2xl font-black ${tone}`}>{count(f)}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 flex-wrap items-center">
        {FILTERS.map(([f, l]) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`h-8 px-3 rounded-lg border text-xs font-semibold ${filter === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-300'}`}>
            {l} ({count(f)})
          </button>
        ))}
        {people.length > 1 && (
          <select value={person} onChange={(e) => setPerson(e.target.value)} className="h-8 px-2 rounded-lg border border-gray-300 text-xs mr-auto">
            <option value="">כל המבקשים</option>
            {people.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}
      </div>

      {untagged.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold text-yellow-800">❔ לא מסווגים ({untagged.length}) — לסווג כבאג או פיתוח</h2>
          {untagged.map((r) => (
            <RequestCard key={r.id} r={r} isCeo collapsible highlight={hash === r.id} />
          ))}
        </section>
      )}

      <section className="space-y-2">
        {shown.length === 0 && <p className="text-sm text-gray-400 py-8 text-center">אין {kind === 'BUG' ? 'באגים' : 'פיתוחים'} להצגה</p>}
        {shown.map((r) => (
          <RequestCard key={r.id} r={r} isCeo collapsible highlight={hash === r.id} />
        ))}
      </section>
    </div>
  );
}
