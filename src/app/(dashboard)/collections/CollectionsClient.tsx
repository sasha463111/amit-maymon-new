'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveCollection, type CollectionRow, type CollectionStatus } from '@/app/actions/collections';
import { formatDate } from '@/lib/dates';

const STATUS_LABEL: Record<CollectionStatus, string> = {
  OPEN: 'לא שולם',
  PARTIAL: 'שולם חלקית',
  PAID: 'שולם',
  DISPUTE: 'במחלוקת',
};
const STATUS_CHIP: Record<CollectionStatus, string> = {
  OPEN: 'bg-gray-100 text-gray-700',
  PARTIAL: 'bg-amber-100 text-amber-800',
  PAID: 'bg-green-100 text-green-800',
  DISPUTE: 'bg-red-100 text-red-800',
};

const ils = (n: number | null) => (n == null ? '' : `₪${Math.round(n).toLocaleString('he-IL')}`);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

/** Expected to collect: the invoice, minus VAT offset and reinstatement when present. */
const expected = (r: CollectionRow) => r.amount_ours - (r.vat_offset ?? 0) - (r.reinstatement ?? 0);
const overdue = (r: CollectionRow) => r.status !== 'PAID' && !!r.claim_check_due_date && r.claim_check_due_date < today();

type Filter = 'open' | 'overdue' | 'paid' | 'dispute' | 'all';

export function CollectionsClient({ rows, error }: { rows: CollectionRow[]; error: string | null }) {
  const [filter, setFilter] = useState<Filter>('open');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const q = query.trim().toLowerCase();

  const counts = useMemo(
    () => ({
      open: rows.filter((r) => r.status === 'OPEN' || r.status === 'PARTIAL').length,
      overdue: rows.filter(overdue).length,
      paid: rows.filter((r) => r.status === 'PAID').length,
      dispute: rows.filter((r) => r.status === 'DISPUTE').length,
      all: rows.length,
    }),
    [rows],
  );

  const shown = useMemo(
    () =>
      rows
        .filter((r) =>
          filter === 'all' ? true
          : filter === 'open' ? r.status === 'OPEN' || r.status === 'PARTIAL'
          : filter === 'overdue' ? overdue(r)
          : filter === 'paid' ? r.status === 'PAID'
          : r.status === 'DISPUTE',
        )
        .filter((r) => !q || [r.plate, r.customer_name, r.insurer, r.invoice_number, r.branch_name].some((v) => (v ?? '').toLowerCase().includes(q))),
    [rows, filter, q],
  );

  const openSum = shown.filter((r) => r.status !== 'PAID').reduce((s, r) => s + Math.max(0, expected(r) - (r.received_amount ?? 0)), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">גבייה</h1>
        <p className="text-sm text-gray-500">תיקים שנסגרו — סכום לגבייה, צ׳ק תביעות בצד ג׳, קיזוז מע״מ וכינון</p>
      </div>
      {error && <p className="text-sm text-red-600">⚠️ {error}</p>}

      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        {([
          ['open', `פתוח (${counts.open})`],
          ['overdue', `⏰ באיחור (${counts.overdue})`],
          ['dispute', `במחלוקת (${counts.dispute})`],
          ['paid', `שולם (${counts.paid})`],
          ['all', `הכול (${counts.all})`],
        ] as [Filter, string][]).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${filter === k ? 'border-red-600 text-red-700' : 'border-transparent text-gray-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔎 רכב, לקוח, חברת ביטוח, מספר חשבונית…"
          className="flex-1 min-w-[220px] h-11 px-3 rounded-xl border border-gray-300 text-sm"
          dir="auto"
        />
        {filter !== 'paid' && <span className="text-sm text-gray-600">יתרה לגבייה בתצוגה: <b>{ils(openSum)}</b></span>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-[1050px] w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs">
            <tr>
              {['תאריך סגירה', 'רכב / לקוח', 'חברת ביטוח', 'סוג', 'חשבונית לתשלום', 'קיזוז מע״מ', 'כינון', 'צ׳ק תביעות (צד ג׳)', 'סטטוס', 'התקבל', ''].map((h) => (
                <th key={h} className="px-3 py-2 text-right font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center text-gray-400 py-8">אין תיקים בתצוגה הזו</td>
              </tr>
            )}
            {shown.map((r) =>
              editing === r.id ? (
                <EditRow key={r.id} r={r} onClose={() => setEditing(null)} />
              ) : (
                <tr key={r.id} className={`align-top ${overdue(r) ? 'bg-red-50/50' : ''}`}>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                    {formatDate(r.closed_on)}
                    {r.branch_name && <div className="text-[11px] text-gray-400">{r.branch_name}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.plate ?? '—'}
                    {r.customer_name && <div className="text-[11px] text-gray-500">{r.customer_name}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.work_source === 'SHIR' ? 'מוקד ש.י.ר' : r.insurer ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.claim_type ?? ''}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-semibold">
                    {ils(r.amount_ours)}
                    {r.invoice_number && <div className="text-[11px] text-gray-400 font-normal" dir="ltr">חשבונית {r.invoice_number}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{ils(r.vat_offset)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{ils(r.reinstatement)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.claim_check_due_date ? (
                      <span className={overdue(r) ? 'text-red-700 font-semibold' : ''}>
                        {formatDate(r.claim_check_due_date)}
                        {overdue(r) ? ' ⏰' : ''}
                      </span>
                    ) : (
                      ''
                    )}
                    {r.claim_check_amount != null && <div className="text-[11px] text-gray-500">{ils(r.claim_check_amount)}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_CHIP[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                    {r.note && <div className="text-[11px] text-gray-500 max-w-[180px] truncate" title={r.note}>{r.note}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.received_amount != null ? ils(r.received_amount) : ''}
                    {r.received_on && <div className="text-[11px] text-gray-400">{formatDate(r.received_on)}</div>}
                    {r.updated_by_name && <div className="text-[11px] text-gray-400">{r.updated_by_name}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button type="button" onClick={() => setEditing(r.id)} className="px-3 h-8 rounded-lg border border-gray-300 text-xs font-semibold">
                      עדכון גבייה
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditRow({ r, onClose }: { r: CollectionRow; onClose: () => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<CollectionStatus>(r.status === 'OPEN' ? 'PAID' : r.status);
  const [amount, setAmount] = useState(r.received_amount != null ? String(r.received_amount) : String(Math.round(expected(r) * 100) / 100));
  const [date, setDate] = useState(r.received_on ?? today());
  const [note, setNote] = useState(r.note ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    const a = amount.replace(/[,₪\s]/g, '');
    const res = await saveCollection(r.id, {
      status,
      received_amount: status === 'OPEN' || !a ? null : Number(a),
      received_on: status === 'OPEN' ? null : date || null,
      note: note || null,
    });
    setBusy(false);
    if (res.error) return setErr(res.error);
    onClose();
    router.refresh();
  }

  const input = 'h-9 px-2 rounded-lg border border-gray-300 text-sm';
  return (
    <tr className="bg-indigo-50/50">
      <td colSpan={11} className="px-3 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="text-sm font-semibold">
            {r.plate} · {r.customer_name ?? ''} · לגבייה {ils(expected(r))}
          </div>
          <div className="flex gap-1">
            {(Object.keys(STATUS_LABEL) as CollectionStatus[]).map((k) => (
              <button key={k} type="button" onClick={() => setStatus(k)} className={`h-9 px-3 rounded-lg border text-xs font-semibold ${status === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-300'}`}>
                {STATUS_LABEL[k]}
              </button>
            ))}
          </div>
          {status !== 'OPEN' && (
            <>
              <label className="text-xs text-gray-500">
                סכום שהתקבל
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={`${input} block w-32`} dir="ltr" />
              </label>
              <label className="text-xs text-gray-500">
                תאריך קבלה
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${input} block`} />
              </label>
            </>
          )}
          <label className="text-xs text-gray-500 flex-1 min-w-[200px]">
            הערה
            <input value={note} onChange={(e) => setNote(e.target.value)} className={`${input} block w-full`} />
          </label>
          <button type="button" onClick={() => void save()} disabled={busy} className="h-9 px-4 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? 'שומר…' : 'שמור'}
          </button>
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm">
            ביטול
          </button>
        </div>
        {err && <p className="text-sm text-red-600 mt-2">⚠️ {err}</p>}
      </td>
    </tr>
  );
}
