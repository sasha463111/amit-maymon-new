'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveCollection, saveInsurerTerm, type CollectionRow, type CollectionStatus } from '@/app/actions/collections';
import { expectedPayment, payerOf, PAYERS_EXTRA, THIRD_PARTY } from '@/lib/collections';
import { INSURERS } from '@/lib/finance';
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
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const ils = (n: number | null) => (n == null ? '' : `₪${Math.round(n).toLocaleString('he-IL')}`);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

/** Expected to collect: the invoice, minus VAT offset and reinstatement when present. */
const toCollect = (r: CollectionRow) => r.amount_ours - (r.vat_offset ?? 0) - (r.reinstatement ?? 0);
const balance = (r: CollectionRow) => Math.max(0, toCollect(r) - (r.received_amount ?? 0));

type Filter = 'open' | 'overdue' | 'waiting' | 'dispute' | 'paid' | 'all';

export function CollectionsClient({
  rows,
  terms,
  canEditTerms,
  error,
}: {
  rows: CollectionRow[];
  terms: Record<string, number>;
  canEditTerms: boolean;
  error: string | null;
}) {
  const [filter, setFilter] = useState<Filter>('open');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);
  const q = query.trim().toLowerCase();
  const t0 = today();

  const enriched = useMemo(() => rows.map((r) => ({ r, exp: expectedPayment(r, terms) })), [rows, terms]);
  type E = (typeof enriched)[number];
  const isOpen = (e: E) => e.r.status !== 'PAID';
  const isOverdue = (e: E) => isOpen(e) && !!e.exp.date && e.exp.date < t0;
  const isWaiting = (e: E) => isOpen(e) && !e.exp.date;

  const counts = {
    open: enriched.filter((e) => isOpen(e) && e.r.status !== 'DISPUTE').length,
    overdue: enriched.filter(isOverdue).length,
    waiting: enriched.filter(isWaiting).length,
    dispute: enriched.filter((e) => e.r.status === 'DISPUTE').length,
    paid: enriched.filter((e) => e.r.status === 'PAID').length,
    all: enriched.length,
  };

  const shown = useMemo(
    () =>
      enriched
        .filter((e) =>
          filter === 'all' ? true
          : filter === 'open' ? isOpen(e) && e.r.status !== 'DISPUTE'
          : filter === 'overdue' ? isOverdue(e)
          : filter === 'waiting' ? isWaiting(e)
          : filter === 'dispute' ? e.r.status === 'DISPUTE'
          : e.r.status === 'PAID',
        )
        .filter((e) => !q || [e.r.plate, e.r.customer_name, e.r.insurer, e.r.invoice_number, e.r.branch_name, payerOf(e.r)].some((v) => (v ?? '').toLowerCase().includes(q)))
        // Open rows: soonest expected payment first; no date at the end.
        .sort((a, b) => (filter === 'paid' || filter === 'all' ? 0 : (a.exp.date ?? '9999').localeCompare(b.exp.date ?? '9999'))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enriched, filter, q, t0],
  );

  // Expected receipts per month (open rows with a date).
  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of enriched) if (isOpen(e) && e.exp.date) m.set(e.exp.date.slice(0, 7), (m.get(e.exp.date.slice(0, 7)) ?? 0) + balance(e.r));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched]);

  const openSum = shown.filter((e) => isOpen(e)).reduce((s, e) => s + balance(e.r), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">גבייה</h1>
          <p className="text-sm text-gray-500">פוליסה / הסדר ג׳: צפי לפי תאריך אישור התשלום + ההסכם (שוטף + X). צד ג׳: לפי מועד פירעון הצ׳ק.</p>
        </div>
        <button type="button" onClick={() => setShowTerms((v) => !v)} className="h-10 px-4 rounded-xl border border-gray-300 bg-white text-sm font-semibold">
          ⚙️ הסכמי תשלום ({Object.keys(terms).length})
        </button>
      </div>
      {error && <p className="text-sm text-red-600">⚠️ {error}</p>}

      {showTerms && <TermsPanel terms={terms} canEdit={canEditTerms} />}

      {byMonth.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {byMonth.map(([ym, sum]) => (
            <div key={ym} className={`rounded-xl border px-3 py-2 text-sm ${ym < t0.slice(0, 7) ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
              <div className="text-[11px] text-gray-500">צפי {MONTHS[Number(ym.slice(5)) - 1]} {ym.slice(0, 4)}</div>
              <div className="font-bold">{ils(sum)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        {([
          ['open', `פתוח (${counts.open})`],
          ['overdue', `⏰ באיחור (${counts.overdue})`],
          ['waiting', `ממתין לאישור / הסכם (${counts.waiting})`],
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
        <table className="min-w-[1150px] w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs">
            <tr>
              {['תאריך סגירה', 'רכב / לקוח', 'חברה', 'סוג', 'חשבונית לתשלום', 'קיזוז מע״מ', 'כינון', 'צ׳ק (צד ג׳)', 'אישור תשלום', 'צפי כניסת כסף', 'סטטוס', ''].map((h) => (
                <th key={h} className="px-3 py-2 text-right font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.length === 0 && (
              <tr>
                <td colSpan={12} className="text-center text-gray-400 py-8">אין תיקים בתצוגה הזו</td>
              </tr>
            )}
            {shown.map((e) => {
              const r = e.r;
              const late = isOverdue(e);
              return editing === r.id ? (
                <EditRow key={r.id} r={r} onClose={() => setEditing(null)} />
              ) : (
                <tr key={r.id} className={`align-top ${late ? 'bg-red-50/50' : ''}`}>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                    {formatDate(r.closed_on)}
                    {r.branch_name && <div className="text-[11px] text-gray-400">{r.branch_name}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.plate ?? '—'}
                    {r.customer_name && <div className="text-[11px] text-gray-500">{r.customer_name}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{payerOf(r) || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.claim_type ?? ''}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-semibold">
                    {ils(r.amount_ours)}
                    {r.invoice_number && <div className="text-[11px] text-gray-400 font-normal" dir="ltr">חשבונית {r.invoice_number}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{ils(r.vat_offset)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{ils(r.reinstatement)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.claim_check_due_date ? formatDate(r.claim_check_due_date) : ''}
                    {r.claim_check_amount != null && <div className="text-[11px] text-gray-500">{ils(r.claim_check_amount)}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.payment_approved_on ? formatDate(r.payment_approved_on) : ''}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.status === 'PAID' ? (
                      <span className="text-green-700">
                        שולם {r.received_on ? formatDate(r.received_on) : ''}
                        {r.received_amount != null && <div className="text-[11px]">{ils(r.received_amount)}</div>}
                      </span>
                    ) : e.exp.date ? (
                      <span className={late ? 'text-red-700 font-semibold' : 'font-semibold'}>
                        {formatDate(e.exp.date)}
                        {late ? ' ⏰' : ''}
                        <div className="text-[11px] text-gray-400 font-normal">{e.exp.basis}</div>
                      </span>
                    ) : (
                      <span className="text-[11px] text-amber-700">{e.exp.basis}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_CHIP[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                    {r.status === 'PARTIAL' && r.received_amount != null && <div className="text-[11px] text-gray-500">התקבל {ils(r.received_amount)}</div>}
                    {r.note && <div className="text-[11px] text-gray-500 max-w-[180px] truncate" title={r.note}>{r.note}</div>}
                    {r.updated_by_name && <div className="text-[11px] text-gray-400">{r.updated_by_name}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button type="button" onClick={() => setEditing(r.id)} className="px-3 h-8 rounded-lg border border-gray-300 text-xs font-semibold">
                      עדכון
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditRow({ r, onClose }: { r: CollectionRow; onClose: () => void }) {
  const router = useRouter();
  const [approved, setApproved] = useState(r.payment_approved_on ?? '');
  const [status, setStatus] = useState<CollectionStatus>(r.status);
  const [amount, setAmount] = useState(r.received_amount != null ? String(r.received_amount) : '');
  const [date, setDate] = useState(r.received_on ?? '');
  const [note, setNote] = useState(r.note ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(override?: Partial<{ status: CollectionStatus; amount: string; date: string }>) {
    const st = override?.status ?? status;
    const a = (override?.amount ?? amount).replace(/[,₪\s]/g, '');
    const d = override?.date ?? date;
    if (st === 'PAID' && !d) return setErr('נא להזין תאריך תשלום בפועל');
    setBusy(true);
    setErr(null);
    const res = await saveCollection(r.id, {
      status: st,
      payment_approved_on: approved || null,
      received_amount: st === 'OPEN' || !a ? null : Number(a),
      received_on: st === 'OPEN' ? null : d || null,
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
      <td colSpan={12} className="px-3 py-3 space-y-3">
        <div className="text-sm font-semibold">
          {r.plate} · {r.customer_name ?? ''} · {payerOf(r)} · {r.claim_type ?? ''} · לגבייה {ils(toCollect(r))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-gray-500">
            תאריך אישור תשלום {r.claim_type === THIRD_PARTY ? '(צד ג׳ — יום כניסת הכסף)' : ''}
            <input type="date" value={approved} onChange={(e) => setApproved(e.target.value)} className={`${input} block`} />
          </label>
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
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={String(Math.round(toCollect(r)))} className={`${input} block w-32`} dir="ltr" />
              </label>
              <label className="text-xs text-gray-500">
                תאריך תשלום בפועל
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${input} block`} />
              </label>
            </>
          )}
          <label className="text-xs text-gray-500 flex-1 min-w-[200px]">
            הערה
            <input value={note} onChange={(e) => setNote(e.target.value)} className={`${input} block w-full`} />
          </label>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => void save()} disabled={busy} className="h-9 px-4 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? 'שומר…' : 'שמור'}
          </button>
          {r.status !== 'PAID' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save({ status: 'PAID', amount: amount || String(Math.round(toCollect(r) * 100) / 100), date: date || today() })}
              className="h-9 px-4 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              ✓ שולם בפועל {date ? formatDate(date) : 'היום'} — סגור
            </button>
          )}
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm">
            ביטול
          </button>
        </div>
        {err && <p className="text-sm text-red-600">⚠️ {err}</p>}
      </td>
    </tr>
  );
}

function TermsPanel({ terms, canEdit }: { terms: Record<string, number>; canEdit: boolean }) {
  const router = useRouter();
  const payers = Array.from(new Set([...INSURERS.filter((i) => i !== 'פרטי'), ...PAYERS_EXTRA, ...Object.keys(terms)]));
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(payers.map((p) => [p, terms[p] != null ? String(terms[p]) : ''])));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(p: string) {
    const v = draft[p].trim();
    setBusy(p);
    setMsg(null);
    const r = await saveInsurerTerm(p, v === '' ? null : Number(v));
    setBusy(null);
    setMsg(r.error ? `⚠️ ${r.error}` : `נשמר ✓ ${p}`);
    if (!r.error) router.refresh();
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div>
        <h2 className="font-bold">הסכמי תשלום — שוטף + X ימים</h2>
        <p className="text-xs text-gray-500">צפי התשלום בפוליסה / הסדר ג׳ = סוף החודש של תאריך אישור התשלום + מספר הימים. {canEdit ? 'ריק = אין הסכם.' : 'עריכה — מנכ״ל בלבד.'}</p>
      </div>
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {payers.map((p) => (
          <div key={p} className="flex items-center gap-2">
            <span className="flex-1 text-sm">{p}</span>
            <span className="text-xs text-gray-500">שוטף +</span>
            <input
              value={draft[p] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [p]: e.target.value.replace(/\D/g, '') }))}
              disabled={!canEdit}
              inputMode="numeric"
              className="w-16 h-9 px-2 rounded-lg border border-gray-300 text-sm text-center disabled:bg-gray-50"
              dir="ltr"
            />
            {canEdit && (draft[p] ?? '') !== (terms[p] != null ? String(terms[p]) : '') && (
              <button type="button" onClick={() => void save(p)} disabled={busy === p} className="h-9 px-3 rounded-lg bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50">
                שמור
              </button>
            )}
          </div>
        ))}
      </div>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
