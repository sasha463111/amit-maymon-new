'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  lookupPlateForCollection,
  openCollectionCase,
  saveInsurerTerm,
  updateCollectionCase,
  type CaseInput,
  type CollectionCase,
  type CollectionStatus,
  type PlateMatch,
} from '@/app/actions/collections';
import { daysLate, expectedPayment, payDateByRule, payerOf, ruleLabel, workingDaysBetween, PAYERS_EXTRA, THIRD_PARTY, type PaymentRule } from '@/lib/collections';
import { CLAIM_TYPES, INSURERS, WORK_SOURCE_LABEL } from '@/lib/finance';
import { formatDate } from '@/lib/dates';

const STATUS_LABEL: Record<CollectionStatus, string> = {
  OPEN: 'בטיפול',
  PAID: 'שולם',
  PARTIAL: 'תשלום חלקי',
  DISPUTE: 'במחלוקת',
  LEGAL: 'מחלקה משפטית',
};
const STATUS_CHIP: Record<CollectionStatus, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  PAID: 'bg-green-100 text-green-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  DISPUTE: 'bg-red-100 text-red-800',
  LEGAL: 'bg-purple-100 text-purple-800',
};
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const ils = (n: number | null | undefined) => (n == null ? '' : `₪${Math.round(n).toLocaleString('he-IL')}`);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const num = (s: string): number | null => {
  const v = s.replace(/[,₪\s]/g, '');
  return v === '' ? null : Number(v);
};
const str = (n: number | null | undefined) => (n == null ? '' : String(n));

/** To collect: the invoice, minus VAT offset and reinstatement when present. */
const toCollect = (c: CollectionCase) => (c.amount_due ?? 0) - (c.vat_offset ?? 0) - (c.reinstatement ?? 0);
const isClosed = (c: CollectionCase) => !!c.closed_at;

type Tab = 'active' | 'overdue' | 'legal' | 'closed' | 'all';

export function CollectionsClient({
  cases,
  collectors,
  terms,
  isCeo,
  error,
}: {
  cases: CollectionCase[];
  collectors: { id: string; name: string }[];
  terms: Record<string, PaymentRule>;
  isCeo: boolean;
  error: string | null;
}) {
  const [who, setWho] = useState<string>('');
  const [tab, setTab] = useState<Tab>('active');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const t0 = today();
  const q = query.trim().toLowerCase();

  const scoped = useMemo(() => (who ? cases.filter((c) => c.assigned_to === who) : cases), [cases, who]);
  const withExp = useMemo(() => scoped.map((c) => ({ c, exp: expectedPayment(c, terms) })), [scoped, terms]);
  type E = (typeof withExp)[number];
  const overdue = (e: E) => !isClosed(e.c) && e.c.status !== 'LEGAL' && !!e.exp.date && e.exp.date < t0;
  const inTab = (e: E) =>
    tab === 'all' ? true
    : tab === 'active' ? !isClosed(e.c) && e.c.status !== 'LEGAL'
    : tab === 'overdue' ? overdue(e)
    : tab === 'legal' ? e.c.status === 'LEGAL'
    : isClosed(e.c);

  const shown = withExp
    .filter(inTab)
    .filter((e) => !q || [e.c.plate, e.c.customer_name, payerOf(e.c), e.c.invoice_number, e.c.legal_lawyer].some((v) => (v ?? '').toLowerCase().includes(q)))
    .sort((a, b) => (tab === 'active' || tab === 'overdue' ? (a.exp.date ?? '9999').localeCompare(b.exp.date ?? '9999') : b.c.opened_at.localeCompare(a.c.opened_at)));

  const counts = {
    active: withExp.filter((e) => !isClosed(e.c) && e.c.status !== 'LEGAL').length,
    overdue: withExp.filter(overdue).length,
    legal: withExp.filter((e) => e.c.status === 'LEGAL').length,
    closed: withExp.filter((e) => isClosed(e.c)).length,
    all: withExp.length,
  };

  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of withExp) {
      if (isClosed(e.c) || e.c.status === 'LEGAL' || !e.exp.date) continue;
      const k = e.exp.date.slice(0, 7);
      m.set(k, (m.get(k) ?? 0) + Math.max(0, toCollect(e.c) - (e.c.received_amount ?? 0)));
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [withExp]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">גבייה</h1>
          <p className="text-sm text-gray-500">תיקי גבייה לפי מסלקת. פוליסה / הסדר ג׳: צפי לפי אישור התשלום + ההסכם. צד ג׳: לפי מועד פירעון הצ׳ק.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpening(true)} className="h-11 px-5 rounded-xl bg-red-600 text-white text-sm font-bold">
            📂 פתיחת תיק
          </button>
          <button type="button" onClick={() => setShowTerms((v) => !v)} className="h-11 px-4 rounded-xl border border-gray-300 bg-white text-sm font-semibold">
            ⚙️ הסכמי תשלום
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">⚠️ {error}</p>}
      {showTerms && <TermsPanel terms={terms} canEdit={isCeo} />}

      {isCeo && (
        <div className="flex gap-2 flex-wrap">
          {[{ id: '', name: 'כל המסלקות' }, ...collectors].map((p) => (
            <button
              key={p.id || 'all'}
              type="button"
              onClick={() => setWho(p.id)}
              className={`h-9 px-4 rounded-full border text-sm font-semibold ${who === p.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300'}`}
            >
              {p.name} <span className="opacity-70">({(p.id ? cases.filter((c) => c.assigned_to === p.id) : cases).filter((c) => !isClosed(c)).length})</span>
            </button>
          ))}
        </div>
      )}

      <Stats cases={scoped} terms={terms} />
      {isCeo && !who && collectors.length > 0 && <PerCollector cases={cases} collectors={collectors} terms={terms} />}

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
          ['active', `בטיפול (${counts.active})`],
          ['overdue', `⏰ באיחור (${counts.overdue})`],
          ['legal', `⚖️ משפטי (${counts.legal})`],
          ['closed', `נסגרו (${counts.closed})`],
          ['all', `הכול (${counts.all})`],
        ] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === k ? 'border-red-600 text-red-700' : 'border-transparent text-gray-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔎 רכב, לקוח, חברת ביטוח, מספר חשבונית, עורך דין…"
        className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm"
        dir="auto"
      />

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-[1150px] w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs">
            <tr>
              {['נפתח', 'רכב / לקוח', 'חברה', 'סוג', 'לגבייה', 'צ׳ק (צד ג׳)', 'אישור תשלום', 'צפי כניסת כסף', 'סטטוס', 'ימי עבודה', ''].map((h) => (
                <th key={h} className="px-3 py-2 text-right font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center text-gray-400 py-8">
                  {cases.length === 0 ? 'עוד לא נפתחו תיקי גבייה — לוחצים "📂 פתיחת תיק"' : 'אין תיקים בתצוגה הזו'}
                </td>
              </tr>
            )}
            {shown.map(({ c, exp }) => {
              const late = overdue({ c, exp });
              const wd = workingDaysBetween(c.opened_at, c.closed_at ?? t0);
              return editing === c.id ? (
                <CaseEditor key={c.id} c={c} onClose={() => setEditing(null)} />
              ) : (
                <tr key={c.id} className={`align-top ${late ? 'bg-red-50/50' : ''}`}>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                    {formatDate(c.opened_at)}
                    {isCeo && <div className="text-[11px] text-gray-500">{c.assigned_name}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {c.plate}
                    {c.customer_name && <div className="text-[11px] text-gray-500">{c.customer_name}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{payerOf(c) || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{c.claim_type ?? ''}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-semibold">
                    {ils(toCollect(c))}
                    {!!(c.vat_offset || c.reinstatement) && (
                      <div className="text-[11px] text-gray-400 font-normal">
                        חשבונית {ils(c.amount_due)}
                        {c.vat_offset ? ` · מע״מ ${ils(c.vat_offset)}` : ''}
                        {c.reinstatement ? ` · כינון ${ils(c.reinstatement)}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {c.claim_check_due_date ? formatDate(c.claim_check_due_date) : ''}
                    {c.claim_check_amount != null && <div className="text-[11px] text-gray-500">{ils(c.claim_check_amount)}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{c.payment_approved_on ? formatDate(c.payment_approved_on) : ''}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {isClosed(c) && c.received_on ? (
                      <span className="text-green-700">
                        שולם {formatDate(c.received_on)}
                        {exp.date && daysLate(exp.date, c.received_on) > 0 && <div className="text-[11px] text-red-600">איחור {daysLate(exp.date, c.received_on)} ימים</div>}
                      </span>
                    ) : exp.date ? (
                      <span className={late ? 'text-red-700 font-semibold' : 'font-semibold'}>
                        {formatDate(exp.date)}
                        {late ? ` ⏰ ${daysLate(exp.date, t0)} ימים` : ''}
                        <div className="text-[11px] text-gray-400 font-normal">{exp.basis}</div>
                      </span>
                    ) : (
                      <span className="text-[11px] text-amber-700">{exp.basis}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_CHIP[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                    {c.status === 'PARTIAL' && (
                      <div className="text-[11px] text-amber-800 max-w-[200px] truncate" title={c.partial_reason ?? ''}>
                        קיזוז {ils(c.offset_amount)} · {c.partial_reason}
                      </div>
                    )}
                    {c.status === 'LEGAL' && (
                      <div className="text-[11px] text-purple-800">
                        {c.legal_lawyer ?? ''} · {c.legal_sent_on ? formatDate(c.legal_sent_on) : ''} · {ils(c.legal_claim_amount)}
                        {c.legal_closed_on && ` · נסגר ${ils(c.legal_recovered_amount)}`}
                      </div>
                    )}
                    {c.note && <div className="text-[11px] text-gray-500 max-w-[200px] truncate" title={c.note}>{c.note}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-center">{wd}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button type="button" onClick={() => setEditing(c.id)} className="px-3 h-8 rounded-lg border border-gray-300 text-xs font-semibold">
                      עדכון
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isCeo && <OffsetsAndLawyers cases={scoped} />}

      {opening && <OpenCaseDialog isCeo={isCeo} collectors={collectors} onClose={() => setOpening(false)} />}
    </div>
  );
}

function Stats({ cases, terms }: { cases: CollectionCase[]; terms: Record<string, PaymentRule> }) {
  const t0 = today();
  const open = cases.filter((c) => !isClosed(c));
  const closed = cases.filter(isClosed);
  const closedThisMonth = closed.filter((c) => (c.closed_at ?? '').slice(0, 7) === t0.slice(0, 7));
  const avgDays = closed.length ? closed.reduce((s, c) => s + workingDaysBetween(c.opened_at, c.closed_at!), 0) / closed.length : null;
  const late = open.filter((c) => {
    const e = expectedPayment(c, terms);
    return c.status !== 'LEGAL' && !!e.date && e.date < t0;
  });
  const partial = cases.filter((c) => c.status === 'PARTIAL');
  const offsets = partial.reduce((s, c) => s + (c.offset_amount ?? 0), 0);
  const balance = open.filter((c) => c.status !== 'LEGAL').reduce((s, c) => s + Math.max(0, toCollect(c) - (c.received_amount ?? 0)), 0);
  const box = (label: string, value: string, hint?: string, red = false) => (
    <div className={`rounded-xl border p-3 ${red ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      {hint && <div className="text-[11px] text-gray-400">{hint}</div>}
    </div>
  );
  return (
    <div className="grid gap-2 grid-cols-2 md:grid-cols-6">
      {box('בטיפול', String(open.length), ils(balance))}
      {box('באיחור', String(late.length), undefined, late.length > 0)}
      {box('נסגרו החודש', String(closedThisMonth.length), `סה״כ נסגרו ${closed.length}`)}
      {box('ממוצע ימי עבודה לתיק', avgDays == null ? '—' : avgDays.toFixed(1), 'מפתיחה עד סגירה (א׳–ה׳)')}
      {box('קיזוזים', ils(offsets) || '₪0', `${partial.length} תיקים`)}
      {box('במחלקה משפטית', String(cases.filter((c) => c.status === 'LEGAL' && !c.legal_closed_on).length))}
    </div>
  );
}

function PerCollector({ cases, collectors, terms }: { cases: CollectionCase[]; collectors: { id: string; name: string }[]; terms: Record<string, PaymentRule> }) {
  const t0 = today();
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm min-w-[720px]">
        <thead className="bg-gray-50 text-xs text-gray-600">
          <tr>
            {['מסלקת', 'בטיפול', 'נסגרו', 'נסגרו החודש', 'ממוצע ימי עבודה', 'באיחור', 'קיזוזים', 'משפטי'].map((h) => (
              <th key={h} className="px-3 py-2 text-right font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {collectors.map((p) => {
            const mine = cases.filter((c) => c.assigned_to === p.id);
            const closed = mine.filter(isClosed);
            const avg = closed.length ? closed.reduce((s, c) => s + workingDaysBetween(c.opened_at, c.closed_at!), 0) / closed.length : null;
            const late = mine.filter((c) => {
              const e = expectedPayment(c, terms);
              return !isClosed(c) && c.status !== 'LEGAL' && !!e.date && e.date < t0;
            }).length;
            const partial = mine.filter((c) => c.status === 'PARTIAL');
            return (
              <tr key={p.id}>
                <td className="px-3 py-2 font-semibold">{p.name}</td>
                <td className="px-3 py-2">{mine.filter((c) => !isClosed(c)).length}</td>
                <td className="px-3 py-2">{closed.length}</td>
                <td className="px-3 py-2">{closed.filter((c) => (c.closed_at ?? '').slice(0, 7) === t0.slice(0, 7)).length}</td>
                <td className="px-3 py-2">{avg == null ? '—' : avg.toFixed(1)}</td>
                <td className={`px-3 py-2 ${late ? 'text-red-700 font-semibold' : ''}`}>{late}</td>
                <td className="px-3 py-2">{partial.length ? `${partial.length} · ${ils(partial.reduce((s, c) => s + (c.offset_amount ?? 0), 0))}` : '—'}</td>
                <td className="px-3 py-2">{mine.filter((c) => c.status === 'LEGAL' && !c.legal_closed_on).length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OffsetsAndLawyers({ cases }: { cases: CollectionCase[] }) {
  const partial = cases.filter((c) => c.status === 'PARTIAL');
  const legal = cases.filter((c) => c.status === 'LEGAL' || c.legal_sent_on);
  const lawyers = new Map<string, { n: number; closed: number; claimed: number; recovered: number }>();
  for (const c of legal) {
    const k = c.legal_lawyer || 'לא צוין';
    const v = lawyers.get(k) ?? { n: 0, closed: 0, claimed: 0, recovered: 0 };
    v.n++;
    if (c.legal_closed_on) {
      v.closed++;
      v.claimed += c.legal_claim_amount ?? 0;
      v.recovered += c.legal_recovered_amount ?? 0;
    }
    lawyers.set(k, v);
  }
  if (!partial.length && !legal.length) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <section className="rounded-xl border border-gray-200 bg-white p-3">
        <h2 className="text-sm font-semibold mb-2">קיזוזים — סיבות וסכומים</h2>
        {partial.length === 0 ? (
          <p className="text-sm text-gray-400">אין</p>
        ) : (
          <ul className="text-sm space-y-1">
            {partial.map((c) => (
              <li key={c.id}>
                <b>{ils(c.offset_amount)}</b> · {payerOf(c)} · {c.plate} — {c.partial_reason}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-xl border border-gray-200 bg-white p-3">
        <h2 className="text-sm font-semibold mb-2">עורכי דין — תביעות שנסגרו: נתבע מול התקבל</h2>
        {lawyers.size === 0 ? (
          <p className="text-sm text-gray-400">אין</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                {['עורך דין', 'תיקים', 'נסגרו', 'נתבע', 'התקבל', '%'].map((h) => (
                  <th key={h} className="text-right font-semibold py-1">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(lawyers.entries()).map(([k, v]) => (
                <tr key={k} className="border-t border-gray-100">
                  <td className="py-1">{k}</td>
                  <td>{v.n}</td>
                  <td>{v.closed}</td>
                  <td>{ils(v.claimed)}</td>
                  <td>{ils(v.recovered)}</td>
                  <td>{v.claimed ? `${Math.round((v.recovered / v.claimed) * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/** Case data fields — shared by "פתיחת תיק" and the editor. */
function CaseFields({ v, set }: { v: CaseInput; set: (p: Partial<CaseInput>) => void }) {
  const input = 'w-full h-9 px-2 rounded-lg border border-gray-300 text-sm bg-white';
  const label = 'block text-[11px] text-gray-500 mb-0.5';
  return (
    <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
      <div>
        <label className={label}>מספר רכב</label>
        <input value={v.plate} onChange={(e) => set({ plate: e.target.value })} className={input} dir="ltr" />
      </div>
      <div>
        <label className={label}>שם לקוח</label>
        <input value={v.customer_name ?? ''} onChange={(e) => set({ customer_name: e.target.value })} className={input} />
      </div>
      <div>
        <label className={label}>מקור עבודה</label>
        <select value={v.work_source} onChange={(e) => set({ work_source: e.target.value })} className={input}>
          {Object.entries(WORK_SOURCE_LABEL).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
      </div>
      {v.work_source !== 'SHIR' && (
        <div>
          <label className={label}>חברת ביטוח</label>
          <input list="col-insurers" value={v.insurer ?? ''} onChange={(e) => set({ insurer: e.target.value })} className={input} />
        </div>
      )}
      <div>
        <label className={label}>סוג תביעה</label>
        <select value={v.claim_type ?? ''} onChange={(e) => set({ claim_type: e.target.value || null })} className={input}>
          <option value="">—</option>
          {CLAIM_TYPES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={label}>תאריך סגירת התיק</label>
        <input type="date" value={v.case_closed_on ?? ''} onChange={(e) => set({ case_closed_on: e.target.value || null })} className={input} />
      </div>
      <div>
        <label className={label}>מספר חשבונית</label>
        <input value={v.invoice_number ?? ''} onChange={(e) => set({ invoice_number: e.target.value })} className={input} dir="ltr" />
      </div>
      <div>
        <label className={label}>סכום חשבונית לתשלום</label>
        <input value={str(v.amount_due)} onChange={(e) => set({ amount_due: num(e.target.value) })} inputMode="decimal" className={input} dir="ltr" />
      </div>
      <div>
        <label className={label}>קיזוז מע״מ</label>
        <input value={str(v.vat_offset)} onChange={(e) => set({ vat_offset: num(e.target.value) })} inputMode="decimal" className={input} dir="ltr" />
      </div>
      <div>
        <label className={label}>כינון</label>
        <input value={str(v.reinstatement)} onChange={(e) => set({ reinstatement: num(e.target.value) })} inputMode="decimal" className={input} dir="ltr" />
      </div>
      {v.claim_type === THIRD_PARTY && (
        <>
          <div>
            <label className={label}>מועד פירעון צ׳ק תביעות</label>
            <input type="date" value={v.claim_check_due_date ?? ''} onChange={(e) => set({ claim_check_due_date: e.target.value || null })} className={input} />
          </div>
          <div>
            <label className={label}>סכום צ׳ק תביעות</label>
            <input value={str(v.claim_check_amount)} onChange={(e) => set({ claim_check_amount: num(e.target.value) })} inputMode="decimal" className={input} dir="ltr" />
          </div>
        </>
      )}
      <datalist id="col-insurers">
        {INSURERS.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>
    </div>
  );
}

const blankCase = (plate = ''): CaseInput => ({
  plate,
  customer_name: null,
  work_source: 'DIRECT',
  insurer: null,
  claim_type: null,
  case_closed_on: null,
  invoice_number: null,
  amount_due: null,
  vat_offset: null,
  reinstatement: null,
  claim_check_due_date: null,
  claim_check_amount: null,
});

function OpenCaseDialog({ isCeo, collectors, onClose }: { isCeo: boolean; collectors: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [plate, setPlate] = useState('');
  const [matches, setMatches] = useState<PlateMatch[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [form, setForm] = useState<CaseInput | null>(null);
  const [assignTo, setAssignTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function search() {
    setErr(null);
    setBusy(true);
    const r = await lookupPlateForCollection(plate);
    setBusy(false);
    if (r.error) return setErr(r.error);
    setMatches(r.matches);
    const free = r.matches.filter((m) => !m.taken_by);
    if (free.length === 1) choose(free[0]);
    else if (r.matches.length === 0) manual();
  }

  function choose(m: PlateMatch) {
    setPicked(m.finance_closure_id);
    setForm({
      plate: m.plate,
      customer_name: m.customer_name,
      work_source: m.work_source,
      insurer: m.insurer,
      claim_type: m.claim_type,
      case_closed_on: m.case_closed_on,
      invoice_number: m.invoice_number,
      amount_due: m.amount_due,
      vat_offset: m.vat_offset,
      reinstatement: m.reinstatement,
      claim_check_due_date: m.claim_check_due_date,
      claim_check_amount: m.claim_check_amount,
    });
  }

  function manual() {
    setPicked(null);
    setForm(blankCase(plate.replace(/\D/g, '')));
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setErr(null);
    const r = await openCollectionCase({ ...form, finance_closure_id: picked, assign_to: isCeo ? assignTo || null : null });
    setBusy(false);
    if (r.error) return setErr(r.error);
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-2" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl p-4 space-y-3 max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">📂 פתיחת תיק גבייה</h2>
          <button type="button" onClick={onClose} className="text-gray-400 text-xl" aria-label="סגור">✕</button>
        </div>
        <div className="flex gap-2">
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void search()}
            placeholder="מספר רכב"
            inputMode="numeric"
            className="flex-1 h-11 px-3 rounded-xl border border-gray-300 text-base"
            dir="ltr"
            autoFocus
          />
          <button type="button" onClick={() => void search()} disabled={busy || !plate.trim()} className="h-11 px-5 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-40">
            {busy && !form ? '…' : 'שלוף נתונים'}
          </button>
        </div>

        {matches && matches.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-gray-500">נמצאו במאגר:</p>
            {matches.map((m) => (
              <button
                key={m.finance_closure_id}
                type="button"
                disabled={!!m.taken_by}
                onClick={() => choose(m)}
                className={`w-full text-right rounded-lg border px-3 py-2 text-sm ${picked === m.finance_closure_id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'} disabled:opacity-50`}
              >
                נסגר {formatDate(m.case_closed_on)} · {m.branch_name ?? ''} · {payerOf(m) || '—'} · {m.claim_type ?? ''} · {ils(m.amount_due)}
                {m.taken_by && <span className="text-red-700"> · כבר בטיפול של {m.taken_by}</span>}
              </button>
            ))}
            <button type="button" onClick={manual} className="text-xs text-indigo-700 underline">
              התיק לא ברשימה — פתיחה ידנית
            </button>
          </div>
        )}
        {matches && matches.length === 0 && <p className="text-sm text-amber-700">הרכב לא נמצא במאגר — ממלאים את הנתונים ידנית.</p>}

        {form && (
          <>
            <p className="text-xs text-gray-500">{picked ? 'הנתונים נשלפו מהמאגר — אפשר להשלים או לתקן:' : 'הקלדה ידנית:'}</p>
            <CaseFields v={form} set={(p) => setForm({ ...form, ...p })} />
            {isCeo && (
              <label className="block text-xs text-gray-500">
                שיוך למסלקת
                <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="block mt-0.5 h-9 px-2 rounded-lg border border-gray-300 text-sm">
                  <option value="">אליי</option>
                  {collectors.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" onClick={() => void save()} disabled={busy} className="w-full h-12 rounded-xl bg-red-600 text-white text-base font-bold disabled:opacity-50">
              {busy ? 'שומר…' : 'פתח תיק'}
            </button>
          </>
        )}
        {err && <p className="text-sm text-red-600">⚠️ {err}</p>}
      </div>
    </div>
  );
}

function CaseEditor({ c, onClose }: { c: CollectionCase; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<CaseInput>({
    plate: c.plate,
    customer_name: c.customer_name,
    work_source: c.work_source,
    insurer: c.insurer,
    claim_type: c.claim_type,
    case_closed_on: c.case_closed_on,
    invoice_number: c.invoice_number,
    amount_due: c.amount_due,
    vat_offset: c.vat_offset,
    reinstatement: c.reinstatement,
    claim_check_due_date: c.claim_check_due_date,
    claim_check_amount: c.claim_check_amount,
  });
  const [showData, setShowData] = useState(false);
  const [approved, setApproved] = useState(c.payment_approved_on ?? '');
  const [status, setStatus] = useState<CollectionStatus>(c.status);
  const [received, setReceived] = useState(str(c.received_amount));
  const [receivedOn, setReceivedOn] = useState(c.received_on ?? '');
  const [reason, setReason] = useState(c.partial_reason ?? '');
  const [offset, setOffset] = useState(str(c.offset_amount));
  const [note, setNote] = useState(c.note ?? '');
  const [legalSent, setLegalSent] = useState(c.legal_sent_on ?? '');
  const [lawyer, setLawyer] = useState(c.legal_lawyer ?? '');
  const [legalClaim, setLegalClaim] = useState(str(c.legal_claim_amount));
  const [legalClosed, setLegalClosed] = useState(c.legal_closed_on ?? '');
  const [legalRecovered, setLegalRecovered] = useState(str(c.legal_recovered_amount));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const due = (data.amount_due ?? 0) - (data.vat_offset ?? 0) - (data.reinstatement ?? 0);

  async function save() {
    setBusy(true);
    setErr(null);
    const paid = status === 'PAID' || status === 'PARTIAL';
    const r = await updateCollectionCase(c.id, {
      ...data,
      payment_approved_on: approved || null,
      status,
      received_amount: paid ? num(received) ?? (status === 'PAID' ? due : null) : null,
      received_on: paid ? receivedOn || null : null,
      partial_reason: status === 'PARTIAL' ? reason : null,
      offset_amount: status === 'PARTIAL' ? num(offset) : null,
      note,
      legal_sent_on: legalSent || null,
      legal_lawyer: lawyer || null,
      legal_claim_amount: num(legalClaim),
      legal_closed_on: legalClosed || null,
      legal_recovered_amount: num(legalRecovered),
    });
    setBusy(false);
    if (r.error) return setErr(r.error);
    onClose();
    router.refresh();
  }

  const input = 'h-9 px-2 rounded-lg border border-gray-300 text-sm bg-white';
  const lab = 'text-[11px] text-gray-500';
  return (
    <tr className="bg-indigo-50/50">
      <td colSpan={11} className="px-3 py-3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm font-semibold">
            {c.plate} · {c.customer_name ?? ''} · {payerOf(data)} · {data.claim_type ?? ''} · לגבייה {ils(due)}
          </div>
          <button type="button" onClick={() => setShowData((v) => !v)} className="text-xs text-indigo-700 underline">
            {showData ? 'הסתר פרטי תיק' : 'ערוך פרטי תיק'}
          </button>
        </div>
        {showData && <CaseFields v={data} set={(p) => setData({ ...data, ...p })} />}

        <div className="flex flex-wrap items-end gap-3">
          <label className={lab}>
            תאריך אישור תשלום {data.claim_type === THIRD_PARTY ? '(צד ג׳ — יום כניסת הכסף)' : ''}
            <input type="date" value={approved} onChange={(e) => setApproved(e.target.value)} className={`${input} block`} />
          </label>
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(STATUS_LABEL) as CollectionStatus[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setStatus(k);
                  if ((k === 'PAID' || k === 'PARTIAL') && !receivedOn) setReceivedOn(today());
                  if (k === 'LEGAL' && !legalSent) setLegalSent(today());
                }}
                className={`h-9 px-3 rounded-lg border text-xs font-semibold ${status === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-300'}`}
              >
                {STATUS_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        {(status === 'PAID' || status === 'PARTIAL') && (
          <div className="flex flex-wrap items-end gap-3">
            <label className={lab}>
              סכום שהתקבל
              <input value={received} onChange={(e) => setReceived(e.target.value)} inputMode="decimal" placeholder={String(Math.round(due))} className={`${input} block w-32`} dir="ltr" />
            </label>
            <label className={lab}>
              תאריך תשלום בפועל
              <input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className={`${input} block`} />
            </label>
            {status === 'PARTIAL' && (
              <>
                <label className={lab}>
                  סכום הקיזוז *
                  <input value={offset} onChange={(e) => setOffset(e.target.value)} inputMode="decimal" className={`${input} block w-32`} dir="ltr" />
                </label>
                <label className={`${lab} flex-1 min-w-[220px]`}>
                  סיבת הקיזוז *
                  <input value={reason} onChange={(e) => setReason(e.target.value)} className={`${input} block w-full`} />
                </label>
              </>
            )}
          </div>
        )}

        {(status === 'LEGAL' || legalSent) && (
          <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-2 flex flex-wrap items-end gap-3">
            <span className="text-xs font-semibold text-purple-800 w-full">⚖️ מחלקה משפטית</span>
            <label className={lab}>
              תאריך העברה
              <input type="date" value={legalSent} onChange={(e) => setLegalSent(e.target.value)} className={`${input} block`} />
            </label>
            <label className={lab}>
              עורך דין
              <input value={lawyer} onChange={(e) => setLawyer(e.target.value)} className={`${input} block w-40`} />
            </label>
            <label className={lab}>
              סכום המחלוקת / התביעה
              <input value={legalClaim} onChange={(e) => setLegalClaim(e.target.value)} inputMode="decimal" className={`${input} block w-32`} dir="ltr" />
            </label>
            <label className={lab}>
              תאריך סיום התביעה
              <input type="date" value={legalClosed} onChange={(e) => setLegalClosed(e.target.value)} className={`${input} block`} />
            </label>
            <label className={lab}>
              שולם בסוף התביעה
              <input value={legalRecovered} onChange={(e) => setLegalRecovered(e.target.value)} inputMode="decimal" className={`${input} block w-32`} dir="ltr" />
            </label>
          </div>
        )}

        <label className={`${lab} block`}>
          הערה
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`${input} block w-full`} />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => void save()} disabled={busy} className="h-9 px-4 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? 'שומר…' : 'שמור'}
          </button>
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
