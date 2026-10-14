'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CollectionCase } from '@/app/actions/collections';
import { payerOf } from '@/lib/collections';
import { formatDate } from '@/lib/dates';
import { OpenCaseDialog } from '../collections/CollectionsClient';
import { FeedbackButton } from '../collections/Feedback';
import { ils, today } from '../collections/shared';

type View = 'open' | 'closed' | 'all';

// A legal case is closed when its legal end date is set (or the case closed).
const legalClosed = (c: CollectionCase) => !!c.legal_closed_on || !!c.closed_at;
const daysSince = (iso: string | null, to: string) => (iso ? Math.max(0, Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime()) / 86_400_000)) : null);

export function LegalClient({ cases, pending = [], collectors, isCeo, error }: { cases: CollectionCase[]; pending?: CollectionCase[]; collectors: { id: string; name: string }[]; isCeo: boolean; error: string | null }) {
  const router = useRouter();
  const [view, setView] = useState<View>('open');
  const [who, setWho] = useState('');
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState(false);
  const t0 = today();

  const mine = useMemo(() => (who ? cases.filter((c) => c.assigned_to === who) : cases), [cases, who]);
  const q = query.trim().toLowerCase();
  const shown = mine
    .filter((c) => (view === 'all' ? true : view === 'open' ? !legalClosed(c) : legalClosed(c)))
    .filter((c) => !q || [c.plate, c.customer_name, payerOf(c), c.legal_reason, c.legal_lawyer, c.claim_number, c.legal_claim_number].some((v) => (v ?? '').toLowerCase().includes(q)))
    .sort((a, b) => (b.legal_sent_on ?? b.opened_at).localeCompare(a.legal_sent_on ?? a.opened_at));
  const open = mine.filter((c) => !legalClosed(c));
  const closed = mine.filter(legalClosed);
  const sum = (xs: CollectionCase[], k: 'legal_claim_amount' | 'legal_recovered_amount') => xs.reduce((t, c) => t + (c[k] ?? 0), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">⚖️ טיפול משפטי</h1>
          <Link href="/collections" className="text-sm text-indigo-700 font-semibold">→ לניהול תביעות ביטוח</Link>
        </div>
        <div className="flex gap-2">
          <FeedbackButton />
          <button type="button" onClick={() => setOpening(true)} className="h-11 px-5 rounded-xl bg-purple-700 text-white text-sm font-bold">
            ⚖️ פתיחת תיק משפטי
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">⚠️ {error}</p>}

      {pending.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 space-y-1">
          <p className="font-bold text-sm text-amber-900">⚠️ {pending.length} תביעות שבבאפי סומנו כמשפטיות, אבל עוד לא הועברו לכאן</p>
          <p className="text-xs text-amber-900">פותחים את התיק ← &quot;סטטוס ותשלום&quot; ← &quot;מחלקה משפטית&quot; (עם סיבה ועורך דין), או &quot;⚖️ פתיחת תיק משפטי&quot; לפי מספר הרכב.</p>
          {pending.map((c) => (
            <Link key={c.id} href={`/collections/${c.id}`} className="block text-sm py-0.5">
              <span className="font-semibold text-indigo-700">{c.plate}</span> · {c.customer_name ?? ''} · {payerOf(c) || '—'} · {c.claim_stage} · {c.assigned_name ?? ''}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {[
          ['תיקים פתוחים', String(open.length)],
          ['סכום בתביעה (פתוחים)', ils(sum(open, 'legal_claim_amount'))],
          ['תיקים שהסתיימו', String(closed.length)],
          ['נגבה בסוף התביעות', ils(sum(closed, 'legal_recovered_amount'))],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-purple-200 bg-purple-50/50 p-3">
            <p className="text-xs text-gray-500">{l}</p>
            <p className="text-xl font-bold text-gray-900">{v}</p>
          </div>
        ))}
      </div>

      {isCeo && (
        <div className="flex gap-1.5 flex-wrap">
          {[{ id: '', name: 'כולם' }, ...collectors].map((p) => (
            <button key={p.id} type="button" onClick={() => setWho(p.id)} className={`h-9 px-3 rounded-lg border text-sm font-semibold ${who === p.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300'}`}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200">
        {([
          ['open', `בטיפול (${open.length})`],
          ['closed', `הסתיימו (${closed.length})`],
          ['all', `הכול (${mine.length})`],
        ] as [View, string][]).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setView(k)} className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${view === k ? 'border-purple-700 text-purple-800' : 'border-transparent text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔎 רכב, לקוח, חברה, סיבה, עורך דין, מספר תביעה…" className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm" dir="auto" />

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-[1000px] w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs">
            <tr>
              {['הועבר', 'רכב / לקוח', 'משלם', 'סיבה', 'עורך דין', 'סכום התביעה', 'תוצאה', 'ימים במשפטי', ''].map((h) => (
                <th key={h} className="px-3 py-2 text-right font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-gray-400 py-8">
                  {cases.length === 0 ? 'עוד אין תיקים בטיפול משפטי — "⚖️ פתיחת תיק משפטי"' : 'אין תיקים בתצוגה הזו'}
                </td>
              </tr>
            )}
            {shown.map((c) => (
              <tr key={c.id} onClick={() => router.push(`/collections/${c.id}`)} className="align-top cursor-pointer hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                  {c.legal_sent_on ? formatDate(c.legal_sent_on) : '—'}
                  {isCeo && <div className="text-[11px] text-gray-500">{c.assigned_name}</div>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="font-semibold text-indigo-700">{c.plate}</span>
                  {c.customer_name && <div className="text-[11px] text-gray-500">{c.customer_name}</div>}
                  {c.event_date && <div className="text-[11px] text-gray-500">תאונה: {formatDate(c.event_date)}</div>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{payerOf(c) || '—'}</td>
                <td className="px-3 py-2 max-w-[220px] text-purple-800">{c.legal_reason ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{c.legal_lawyer ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap font-semibold">{c.legal_claim_amount != null ? ils(c.legal_claim_amount) : '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {legalClosed(c) ? (
                    <span className="text-green-700">הסתיים {c.legal_closed_on ? formatDate(c.legal_closed_on) : ''} · נגבה {ils(c.legal_recovered_amount ?? 0)}</span>
                  ) : (
                    <span className="text-gray-500">בטיפול</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-center">{daysSince(c.legal_sent_on, c.legal_closed_on ?? t0) ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <Link href={`/collections/${c.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center px-3 h-8 rounded-lg border border-gray-300 text-xs font-semibold">
                    📂 פתיחה
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {opening && <OpenCaseDialog legal isCeo={isCeo} collectors={collectors} onClose={() => setOpening(false)} />}
    </div>
  );
}
