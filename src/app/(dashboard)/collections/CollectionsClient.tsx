'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MyReminder } from '@/app/actions/collectionFile';
import {
  lookupPlateForCollection,
  openCollectionCase,
  saveInsurerTerm,
  setShirInvoice,
  markShirMonthPaid,
  type ShirInvoice,
  updateCollectionCase,
  type CaseInput,
  type CollectionCase,
  type CollectionStatus,
  type PlateMatch,
} from '@/app/actions/collections';
import { daysLate, expectedPayment, payDateByRule, payerOf, ruleLabel, workingDaysBetween, PAYERS_EXTRA, type PaymentRule } from '@/lib/collections';
import { INSURERS } from '@/lib/finance';
import { CaseFields, STATUS_CHIP, STATUS_LABEL, ils, isClosed, num, str, toCollect, today } from './shared';
import { formatDate } from '@/lib/dates';

type Tab = 'active' | 'overdue' | 'legal' | 'closed' | 'all' | 'shir';

export function CollectionsClient({
  cases,
  collectors,
  terms,
  isCeo,
  canEditTerms = false,
  shir = [],
  reminders = [],
  error,
}: {
  cases: CollectionCase[];
  collectors: { id: string; name: string }[];
  terms: Record<string, PaymentRule>;
  isCeo: boolean;
  canEditTerms?: boolean;
  shir?: ShirInvoice[];
  reminders?: MyReminder[];
  error: string | null;
}) {
  const router = useRouter();
  const [who, setWho] = useState<string>('');
  const [tab, setTab] = useState<Tab>('active');
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const t0 = today();
  const q = query.trim().toLowerCase();

  const scoped = useMemo(() => (who ? cases.filter((c) => c.assigned_to === who) : cases), [cases, who]);
  const withExp = useMemo(() => scoped.map((c) => ({ c, exp: expectedPayment(c, terms) })), [scoped, terms]);
  type E = (typeof withExp)[number];
  const overdue = (e: E) => !isClosed(e.c) && e.c.status !== 'LEGAL' && e.c.status !== 'BLOCKED' && !!e.exp.date && e.exp.date < t0;
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
      {reminders.length > 0 && <RemindersStrip reminders={reminders} />}
      {showTerms && <TermsPanel terms={terms} canEdit={canEditTerms} />}

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


      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        {([
          ['active', `בטיפול (${counts.active})`],
          ['overdue', `⏰ באיחור (${counts.overdue})`],
          ['legal', `⚖️ משפטי (${counts.legal})`],
          ['closed', `נסגרו (${counts.closed})`],
          ['all', `הכול (${counts.all})`],
          ['shir', '🧾 ש.י.ר — ריכוז חודשי'],
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

      {tab === 'shir' ? (
        <ShirBatch invoices={shir} terms={terms} />
      ) : (
      <>
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
              return (
                <tr key={c.id} onClick={() => router.push(`/collections/${c.id}`)} className={`align-top cursor-pointer hover:bg-gray-50 ${late ? 'bg-red-50/50' : ''}`}>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                    {formatDate(c.opened_at)}
                    {isCeo && <div className="text-[11px] text-gray-500">{c.assigned_name}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link href={`/collections/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-indigo-700">
                      {c.plate}
                    </Link>
                    {c.customer_name && <div className="text-[11px] text-gray-500">{c.customer_name}</div>}
                    {c.claim_number && <div className="text-[11px] text-gray-500">תביעה: {c.claim_number}</div>}
                    {c.claim_stage && <div className="text-[11px] text-indigo-700">{c.claim_stage}</div>}
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
                    {!!c.offset_amount && (
                      <div className="text-[11px] text-amber-800 max-w-[200px] truncate" title={c.partial_reason ?? ''}>
                        קיזוז: {ils(c.offset_amount)} · סיבה: {c.partial_reason}
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
                    <Link href={`/collections/${c.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center px-3 h-8 rounded-lg border border-gray-300 text-xs font-semibold">
                      📂 פתיחה
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      </>
      )}

      {opening && <OpenCaseDialog isCeo={isCeo} collectors={collectors} onClose={() => setOpening(false)} />}
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

/** My open reminders — due ones first (Amit, 14/10: reminders in every case and on the phone). */
function RemindersStrip({ reminders }: { reminders: MyReminder[] }) {
  const now = new Date().toISOString();
  const due = reminders.filter((r) => r.remind_at <= now);
  const later = reminders.filter((r) => r.remind_at > now);
  const at = (iso: string) => new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const Row = ({ r, late }: { r: MyReminder; late: boolean }) => (
    <Link href={`/collections/${r.case_id}#r-${r.id}`} className={`block rounded-lg border px-3 py-2 text-sm ${late ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <span className={`font-semibold ${late ? 'text-amber-800' : 'text-gray-700'}`}>⏰ {at(r.remind_at)}</span>
      <span className="text-gray-500"> · רכב: </span>
      <span className="font-semibold">{r.plate}</span>
      {r.customer_name && <span className="text-gray-500"> · {r.customer_name}</span>}
      <div className="text-gray-800">{r.body}</div>
    </Link>
  );
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-3 space-y-2">
      <p className="font-bold text-sm">⏰ התזכורות שלי {due.length > 0 && <span className="text-amber-700">· {due.length} להיום / באיחור</span>}</p>
      <div className="grid gap-1.5 md:grid-cols-2">
        {due.map((r) => <Row key={r.id} r={r} late />)}
        {later.slice(0, 6).map((r) => <Row key={r.id} r={r} late={false} />)}
      </div>
      {later.length > 6 && <p className="text-xs text-gray-500">ועוד {later.length - 6} תזכורות עתידיות</p>}
    </div>
  );
}

const EMPTY_RULE = (insurer: string): PaymentRule => ({ insurer, agreement: '', mode: 'MONTHLY', offset_months: 1, pay_day: 15, cutoff_day: null, notes: '', basis: 'APPROVAL' });
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
      remove ? null : { agreement: r.agreement, mode: r.mode, offset_months: r.offset_months, pay_day: r.pay_day, cutoff_day: r.cutoff_day, notes: r.notes, basis: r.basis ?? 'APPROVAL' },
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
            <div className="flex gap-1">
              {(['APPROVAL', 'INVOICE'] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setR({ ...r, basis: b })}
                  className={`h-9 px-3 rounded-lg border text-xs font-semibold ${(r.basis ?? 'APPROVAL') === b ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-300'}`}
                >
                  {b === 'APPROVAL' ? 'מתאריך אישור התשלום' : 'מחודש החשבונית (ריכוז חודשי)'}
                </button>
              ))}
            </div>
          )}
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

// ---- ש.י.ר monthly batch (Amit, 2026-10-14) -------------------------------
// Invoices grouped by invoice month; each month is paid together on the date of
// the ש.י.ר agreement (שוטף 60 → the 7th of the third month), minus offsets,
// without blocked invoices.
function ShirBatch({ invoices, terms }: { invoices: ShirInvoice[]; terms: Record<string, PaymentRule> }) {
  const router = useRouter();
  const rule = terms['מוקד ש.י.ר'];
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const t0 = today();

  const months = useMemo(() => {
    const m = new Map<string, ShirInvoice[]>();
    for (const i of invoices) m.set(i.closed_on.slice(0, 7), [...(m.get(i.closed_on.slice(0, 7)) ?? []), i]);
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [invoices]);

  async function monthPaid(ym: string) {
    const d = window.prompt('תאריך התשלום בפועל (YYYY-MM-DD):', t0);
    if (!d) return;
    setBusy(ym);
    setMsg(null);
    const r = await markShirMonthPaid(ym, d.trim());
    setBusy(null);
    setMsg(r.error ? `⚠️ ${r.error}` : `✓ סומנו כשולמו ${r.paid ?? 0} חשבוניות`);
    if (!r.error) router.refresh();
  }

  if (!invoices.length) return <p className="text-gray-400 py-8 text-center">אין חשבוניות ש.י.ר</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        <span className="text-gray-400">ההסכם: </span>
        {rule ? `${rule.agreement ?? ''} — ${ruleLabel(rule)}` : 'אין הסכם ש.י.ר (⚙️ הסכמי תשלום)'}
      </p>
      {msg && <p className="text-sm">{msg}</p>}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              {['חודש חשבוניות', 'מועד תשלום צפוי', 'חשבוניות', 'סכום חשבוניות', 'קיזוזים', 'חסומות', 'נטו לתשלום', 'סטטוס', ''].map((h) => (
                <th key={h} className="px-3 py-2 text-right font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {months.map(([ym, list]) => {
              const due = rule ? payDateByRule(`${ym}-01`, { ...rule, cutoff_day: null }) : null;
              const blocked = list.filter((i) => i.status === 'BLOCKED');
              const live = list.filter((i) => i.status !== 'BLOCKED');
              const gross = live.reduce((s, i) => s + i.amount, 0);
              const offsets = live.reduce((s, i) => s + (i.offset_amount ?? 0), 0);
              const paid = live.filter((i) => i.status === 'PAID' || i.status === 'PARTIAL');
              const allPaid = live.length > 0 && paid.length === live.length;
              const late = !allPaid && !!due && due < t0;
              return (
                <Fragment key={ym}>
                  <tr className={late ? 'bg-red-50/50' : ''}>
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">{MONTH_NAMES[Number(ym.slice(5)) - 1]} {ym.slice(0, 4)}</td>
                    <td className={`px-3 py-2 whitespace-nowrap ${late ? 'text-red-700 font-semibold' : ''}`}>{due ? formatDate(due) : '—'}{late ? ' ⏰' : ''}</td>
                    <td className="px-3 py-2">{list.length}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{ils(gross)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-amber-800">{offsets ? ils(offsets) : ''}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{blocked.length ? `${blocked.length} · ${ils(blocked.reduce((s, i) => s + i.amount, 0))}` : ''}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-bold">{ils(gross - offsets)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {allPaid ? (
                        <span className="text-green-700 font-semibold">שולם {paid[0]?.received_on ? formatDate(paid[0].received_on) : ''}</span>
                      ) : paid.length ? (
                        <span className="text-amber-700">שולמו {paid.length} מתוך {live.length}</span>
                      ) : (
                        <span className="text-gray-500">ממתין</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap flex gap-2">
                      <button type="button" onClick={() => setOpen(open === ym ? null : ym)} className="px-3 h-8 rounded-lg border border-gray-300 text-xs font-semibold">
                        {open === ym ? 'סגור' : 'פירוט'}
                      </button>
                      {!allPaid && (
                        <button type="button" disabled={busy === ym} onClick={() => void monthPaid(ym)} className="px-3 h-8 rounded-lg bg-green-600 text-white text-xs font-semibold disabled:opacity-50">
                          ✓ החודש שולם
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === ym && (
                    <tr>
                      <td colSpan={9} className="bg-gray-50 px-3 py-2">
                        <table className="w-full text-sm">
                          <thead className="text-[11px] text-gray-500">
                            <tr>
                              {['תאריך חשבונית', 'רכב', 'לקוח', 'מספר חשבונית', 'סכום', 'קיזוז', 'סיבת קיזוז', 'חסומה', 'סטטוס', ''].map((h) => (
                                <th key={h} className="text-right font-semibold py-1 px-2 whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {list.map((i) => (
                              <ShirRow key={i.finance_closure_id} i={i} />
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ShirRow({ i }: { i: ShirInvoice }) {
  const router = useRouter();
  const [offset, setOffset] = useState(str(i.offset_amount));
  const [reason, setReason] = useState(i.offset_reason ?? '');
  const [blocked, setBlocked] = useState(i.status === 'BLOCKED');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const done = i.status === 'PAID' || i.status === 'PARTIAL';
  const dirty = offset !== str(i.offset_amount) || reason !== (i.offset_reason ?? '') || blocked !== (i.status === 'BLOCKED');

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await setShirInvoice(i.finance_closure_id, { offset_amount: num(offset), offset_reason: reason || null, blocked });
    setBusy(false);
    if (r.error) return setErr(r.error);
    router.refresh();
  }

  const input = 'h-8 px-2 rounded border border-gray-300 text-sm bg-white';
  return (
    <tr className="border-t border-gray-200 align-top">
      <td className="px-2 py-1 whitespace-nowrap">{formatDate(i.closed_on)}</td>
      <td className="px-2 py-1 whitespace-nowrap">{i.plate}</td>
      <td className="px-2 py-1">{i.customer_name ?? ''}</td>
      <td className="px-2 py-1 whitespace-nowrap" dir="ltr">{i.invoice_number ?? ''}</td>
      <td className="px-2 py-1 whitespace-nowrap">{ils(i.amount)}</td>
      <td className="px-2 py-1">
        <input value={offset} onChange={(e) => setOffset(e.target.value)} disabled={done} inputMode="decimal" className={`${input} w-24`} dir="ltr" />
      </td>
      <td className="px-2 py-1">
        <input value={reason} onChange={(e) => setReason(e.target.value)} disabled={done} className={`${input} w-48`} />
      </td>
      <td className="px-2 py-1 text-center">
        <input type="checkbox" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} disabled={done} className="w-4 h-4" />
      </td>
      <td className="px-2 py-1 whitespace-nowrap">
        {i.status ? <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_CHIP[i.status]}`}>{STATUS_LABEL[i.status]}</span> : <span className="text-[11px] text-gray-400">לא נפתח תיק</span>}
        {i.assigned_name && <div className="text-[11px] text-gray-500">{i.assigned_name}</div>}
      </td>
      <td className="px-2 py-1 whitespace-nowrap">
        {dirty && !done && (
          <button type="button" onClick={() => void save()} disabled={busy} className="px-3 h-8 rounded bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50">
            {busy ? '…' : 'שמור'}
          </button>
        )}
        {err && <div className="text-[11px] text-red-600">{err}</div>}
      </td>
    </tr>
  );
}

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
