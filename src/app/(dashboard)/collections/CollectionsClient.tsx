'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveCollection, saveInsurerTerm, type CollectionRow, type CollectionStatus } from '@/app/actions/collections';
import { expectedPayment, payDateByRule, payerOf, ruleLabel, PAYERS_EXTRA, THIRD_PARTY, type PaymentRule } from '@/lib/collections';
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
  terms: Record<string, PaymentRule>;
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
          <p className="text-sm text-gray-500">פוליסה / הסדר ג׳: צפי לפי תאריך אישור התשלום + ההסכם עם החברה. צד ג׳: לפי מועד פירעון הצ׳ק.</p>
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

const EMPTY_RULE = (insurer: string): PaymentRule => ({ insurer, agreement: '', mode: 'MONTHLY', offset_months: 1, pay_day: 15, cutoff_day: null, notes: '' });
const exampleDay = () => `${today().slice(0, 7)}-10`;

function TermsPanel({ terms, canEdit }: { terms: Record<string, PaymentRule>; canEdit: boolean }) {
  const [extra, setExtra] = useState<string[]>([]);
  const payers = Array.from(new Set([...Object.keys(terms), ...INSURERS.filter((i) => i !== 'פרטי'), ...PAYERS_EXTRA, ...extra]));
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState('');

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div>
        <h2 className="font-bold">הסכמי תשלום עם חברות הביטוח</h2>
        <p className="text-xs text-gray-500">
          צפי התשלום בפוליסה / הסדר ג׳ מחושב מתאריך אישור התשלום לפי ההסכם. {canEdit ? 'אפשר לערוך ולהוסיף חברה.' : 'עריכה — מנכ״ל בלבד.'}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="text-xs text-gray-500">
            <tr>
              {['חברה', 'הסכם', 'חישוב', `דוגמה (אושרה ב-${formatDate(exampleDay())})`, ''].map((h) => (
                <th key={h} className="text-right font-semibold px-2 py-1">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payers.map((p) => {
              const rule = terms[p];
              const ex = rule ? payDateByRule(exampleDay(), rule) : null;
              return editing === p ? (
                <RuleEditor key={p} rule={rule ?? EMPTY_RULE(p)} exists={!!rule} onClose={() => setEditing(null)} />
              ) : (
                <tr key={p}>
                  <td className="px-2 py-1.5 font-semibold whitespace-nowrap">{p}</td>
                  <td className="px-2 py-1.5">{rule?.agreement ?? (rule ? '' : <span className="text-amber-700 text-xs">אין הסכם</span>)}</td>
                  <td className="px-2 py-1.5 text-xs text-gray-600">{rule ? ruleLabel(rule) : ''}</td>
                  <td className="px-2 py-1.5 text-xs text-gray-600 whitespace-nowrap">{ex ? `→ ${formatDate(ex)}` : ''}</td>
                  <td className="px-2 py-1.5">
                    {canEdit && (
                      <button type="button" onClick={() => setEditing(p)} className="px-3 h-8 rounded-lg border border-gray-300 text-xs font-semibold">
                        {rule ? 'ערוך' : 'הוסף הסכם'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="flex gap-2 items-center">
          <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="חברה נוספת (שם)" className="h-9 px-3 rounded-lg border border-gray-300 text-sm" />
          <button
            type="button"
            disabled={!adding.trim()}
            onClick={() => {
              const name = adding.trim();
              setExtra((x) => [...x, name]);
              setEditing(name);
              setAdding('');
            }}
            className="h-9 px-3 rounded-lg bg-gray-900 text-white text-xs font-semibold disabled:opacity-40"
          >
            + הוסף חברה
          </button>
        </div>
      )}
    </div>
  );
}

function RuleEditor({ rule, exists, onClose }: { rule: PaymentRule; exists: boolean; onClose: () => void }) {
  const router = useRouter();
  const [r, setR] = useState<PaymentRule>(rule);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const num = (v: string) => {
    const d = v.replace(/[^0-9]/g, '');
    return d === '' ? null : Number(d);
  };
  const preview = payDateByRule(exampleDay(), r);

  async function save(remove = false) {
    setBusy(true);
    setErr(null);
    const res = await saveInsurerTerm(
      rule.insurer,
      remove ? null : { agreement: r.agreement, mode: r.mode, offset_months: r.offset_months, pay_day: r.pay_day, cutoff_day: r.cutoff_day, notes: r.notes },
    );
    setBusy(false);
    if (res.error) return setErr(res.error);
    onClose();
    router.refresh();
  }

  const input = 'h-9 px-2 rounded-lg border border-gray-300 text-sm';
  return (
    <tr className="bg-indigo-50/50">
      <td colSpan={5} className="px-2 py-3 space-y-2">
        <div className="font-semibold">{rule.insurer}</div>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-gray-500">
            הסכם (טקסט)
            <input value={r.agreement ?? ''} onChange={(e) => setR({ ...r, agreement: e.target.value })} placeholder="שוטף 30" className={`${input} block w-40`} />
          </label>
          <div className="flex gap-1">
            {(['MONTHLY', 'BIWEEKLY'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setR({ ...r, mode: m })}
                className={`h-9 px-3 rounded-lg border text-xs font-semibold ${r.mode === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-300'}`}
              >
                {m === 'MONTHLY' ? 'פעם בחודש' : 'כל שבועיים (15 / סוף חודש)'}
              </button>
            ))}
          </div>
          {r.mode === 'MONTHLY' && (
            <>
              <label className="text-xs text-gray-500">
                חודשים אחרי חודש האישור
                <input value={r.offset_months ?? ''} onChange={(e) => setR({ ...r, offset_months: num(e.target.value) })} inputMode="numeric" className={`${input} block w-24 text-center`} dir="ltr" />
              </label>
              <label className="text-xs text-gray-500">
                יום תשלום (31 = סוף חודש)
                <input value={r.pay_day ?? ''} onChange={(e) => setR({ ...r, pay_day: num(e.target.value) })} inputMode="numeric" className={`${input} block w-24 text-center`} dir="ltr" />
              </label>
              <label className="text-xs text-gray-500">
                יום חיתוך (רשות)
                <input value={r.cutoff_day ?? ''} onChange={(e) => setR({ ...r, cutoff_day: num(e.target.value) })} inputMode="numeric" placeholder="25" className={`${input} block w-24 text-center`} dir="ltr" />
              </label>
            </>
          )}
          <label className="text-xs text-gray-500 flex-1 min-w-[180px]">
            הערה / דוגמה
            <input value={r.notes ?? ''} onChange={(e) => setR({ ...r, notes: e.target.value })} className={`${input} block w-full`} />
          </label>
        </div>
        <p className="text-xs text-gray-600">
          {preview ? `בדיקה: תביעה שאושרה ב-${formatDate(exampleDay())} תשולם ב-${formatDate(preview)}` : 'מלא/י חודשים ויום תשלום'}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => void save()} disabled={busy} className="h-9 px-4 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? 'שומר…' : 'שמור'}
          </button>
          {exists && (
            <button
              type="button"
              onClick={() => {
                if (confirm('להסיר את ההסכם?')) void save(true);
              }}
              disabled={busy}
              className="h-9 px-3 rounded-lg border border-red-300 text-red-700 bg-white text-sm"
            >
              הסר הסכם
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
