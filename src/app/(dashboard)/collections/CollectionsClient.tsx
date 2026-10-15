'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { lookupPlateHistory, type ExistingCollection, type Feedback, type MyReminder, type RepairMatch } from '@/app/actions/collectionFile';
import { FeedbackButton, FeedbackList } from './Feedback';
import { WeeklyView } from './Weekly';
import type { WeeklySummary } from '@/lib/collectionsWeekly.server';
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
import { INSURERS, financeDefaultsFromSubType } from '@/lib/finance';
import { CaseFields, STATUS_CHIP, STATUS_LABEL, ils, isClosed, num, str, toCollect, today } from './shared';
import { formatDate } from '@/lib/dates';
import { shortVehicle } from '@/lib/vehicleLabel';
import { LicensePlate } from '@/components/ui/LicensePlate';
import { StatCard, StatGrid } from '@/components/ui/kit';
import { LEGAL_REASONS, OTHER } from '@/lib/collectionStages';

type Tab = 'active' | 'overdue' | 'legal' | 'closed' | 'all' | 'shir' | 'feedback' | 'summary';

export function CollectionsClient({
  cases,
  collectors,
  terms,
  isCeo,
  canEditTerms = false,
  shir = [],
  reminders = [],
  feedback = [],
  weekly = null,
  initialTab,
  error,
}: {
  cases: CollectionCase[];
  collectors: { id: string; name: string }[];
  terms: Record<string, PaymentRule>;
  isCeo: boolean;
  canEditTerms?: boolean;
  shir?: ShirInvoice[];
  reminders?: MyReminder[];
  feedback?: Feedback[];
  weekly?: WeeklySummary | null;
  initialTab?: string;
  error: string | null;
}) {
  const router = useRouter();
  const [who, setWho] = useState<string>('');
  const [tab, setTab] = useState<Tab>(initialTab === 'feedback' ? 'feedback' : initialTab === 'summary' && weekly ? 'summary' : 'active');
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  // Table or cards (Amit, 14/10: "כמו עכשיו וכמו בתיקים") — remembered per device.
  const [view, setView] = useState<'table' | 'cards'>('table');
  useEffect(() => {
    try {
      const v = localStorage.getItem('collections.view');
      if (v === 'cards' || v === 'table') setView(v);
    } catch {}
  }, []);
  const chooseView = (v: 'table' | 'cards') => {
    setView(v);
    try {
      localStorage.setItem('collections.view', v);
    } catch {}
  };
  const t0 = today();
  const q = query.trim().toLowerCase();

  const scoped = useMemo(() => (who ? cases.filter((c) => c.assigned_to === who) : cases), [cases, who]);
  const withExp = useMemo(() => scoped.map((c) => ({ c, exp: expectedPayment(c, terms) })), [scoped, terms]);
  type E = (typeof withExp)[number];
  const overdue = (e: E) => !isClosed(e.c) && !e.c.received_on && e.c.status !== 'PAID' && e.c.status !== 'PARTIAL' && e.c.status !== 'LEGAL' && e.c.status !== 'BLOCKED' && !!e.exp.date && e.exp.date < t0;
  const inTab = (e: E) =>
    tab === 'all' ? true
    : tab === 'active' ? !isClosed(e.c) && e.c.status !== 'LEGAL'
    : tab === 'overdue' ? overdue(e)
    : tab === 'legal' ? e.c.status === 'LEGAL'
    : isClosed(e.c);

  const shown = withExp
    .filter(inTab)
    .filter((e) => !q || [e.c.plate, e.c.customer_name, payerOf(e.c), e.c.invoice_number, e.c.legal_lawyer, e.c.claim_number, e.c.tp_claim_number, e.c.claim_stage, e.c.external_ref].some((v) => (v ?? '').toLowerCase().includes(q)))
    .sort((a, b) => (tab === 'active' || tab === 'overdue' ? (a.exp.date ?? '9999').localeCompare(b.exp.date ?? '9999') : b.c.opened_at.localeCompare(a.c.opened_at)));

  const counts = {
    active: withExp.filter((e) => !isClosed(e.c) && e.c.status !== 'LEGAL').length,
    overdue: withExp.filter(overdue).length,
    legal: withExp.filter((e) => e.c.status === 'LEGAL').length,
    closed: withExp.filter((e) => isClosed(e.c)).length,
    all: withExp.length,
  };
  const sumOf = (list: E[]) => list.reduce((s, e) => s + toCollect(e.c), 0);
  const paidMonth = scoped.filter((c) => c.received_on && c.received_on.slice(0, 7) === t0.slice(0, 7));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">ניהול תביעות ביטוח</h1>
          <p className="text-sm text-gray-500">תיקי תביעה לפי מסלקת. מועד הפירעון — צד ג׳: לפי הצ׳ק; פוליסה / הסדר ג׳: לפי אישור התשלום וההסכם.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpening(true)} className="h-11 px-5 rounded-xl bg-red-600 text-white text-sm font-bold">
            📂 פתיחת תיק
          </button>
          <FeedbackButton />
          {canEditTerms && (
            <button type="button" onClick={() => setShowTerms((v) => !v)} className="h-11 px-4 rounded-xl border border-gray-300 bg-white text-sm font-semibold">
              ⚙️ הסכמי תשלום
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-red-600">⚠️ {error}</p>}
      {reminders.length > 0 && <RemindersStrip reminders={reminders} />}
      {showTerms && canEditTerms && <TermsPanel terms={terms} canEdit={canEditTerms} />}

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
          ['closed', `נסגרו (${counts.closed})`],
          ['all', `הכול (${counts.all})`],
          ['shir', '🧾 ש.י.ר — ריכוז חודשי'],
          ['feedback', `💡 פידבק (${feedback.length})`],
          ...(weekly ? ([['summary', '📊 סיכום שבועי']] as [Tab, string][]) : []),
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
        <Link href="/legal" className="px-4 py-2 text-sm font-semibold whitespace-nowrap text-purple-700">
          ⚖️ טיפול משפטי ({counts.legal}) ←
        </Link>
      </div>

      {/* Summary strip — the shared kit (Tomer 15/10, "עיצוב אחיד"). Money only
          for CEO / bookkeeper: collectors see counts, not money summaries. */}
      {(tab === 'active' || tab === 'overdue' || tab === 'closed' || tab === 'all') && (
        <StatGrid>
          <StatCard label="בטיפול" value={counts.active} hint={isCeo ? `לגבייה ${ils(sumOf(withExp.filter((e) => !isClosed(e.c) && e.c.status !== 'LEGAL')))}` : undefined} onClick={() => setTab('active')} active={tab === 'active'} />
          <StatCard label="⏰ באיחור" value={counts.overdue} hint={isCeo ? ils(sumOf(withExp.filter(overdue))) : 'עבר מועד הפירעון'} tone={counts.overdue ? 'bad' : 'good'} onClick={() => setTab('overdue')} active={tab === 'overdue'} />
          <StatCard label="שולמו החודש" value={paidMonth.length} hint={isCeo ? ils(paidMonth.reduce((s, c) => s + (c.received_amount ?? 0), 0)) : undefined} tone="good" onClick={() => setTab('closed')} active={tab === 'closed'} />
          <StatCard label="⚖️ טיפול משפטי" value={counts.legal} tone={counts.legal ? 'warn' : 'neutral'} href="/legal" />
        </StatGrid>
      )}

      {tab === 'summary' && weekly ? (
        <WeeklyView s={weekly} />
      ) : tab === 'feedback' ? (
        <FeedbackList items={feedback} supervisor={isCeo} />
      ) : tab === 'shir' ? (
        <ShirBatch invoices={shir} terms={terms} />
      ) : (
      <>
      {/* Search + view on one row (Amit 15/10: "אצלנו מרגיש גדול מדי"). */}
      <div className="flex gap-2 items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔎 רכב, לקוח, חברת ביטוח, מספר תביעה, מצב תביעה, חשבונית, עורך דין…"
          className="flex-1 min-w-0 h-10 px-3 rounded-xl border border-gray-300 text-sm"
          dir="auto"
        />
        <div className="inline-flex rounded-xl border border-gray-300 bg-white p-0.5 shrink-0">
          {([['table', '📋 טבלה'], ['cards', '🔲 כרטיסים']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => chooseView(k)} className={`h-8 px-3 rounded-lg text-xs font-semibold ${view === k ? 'bg-gray-900 text-white' : 'text-gray-700'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {view === 'cards' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {shown.length === 0 && <p className="text-gray-400 py-8 text-center col-span-full">אין תיקים בתצוגה הזו</p>}
          {shown.map(({ c, exp }) => (
            <ClaimCard key={c.id} c={c} exp={exp} late={overdue({ c, exp })} t0={t0} showCollector={isCeo} />
          ))}
        </div>
      ) : (
      <div className="overflow-auto max-h-[72vh] rounded-xl border border-gray-200 bg-white">
        {/* Compact table (Amit 15/10, like BAFI: "מקום לכל דבר"): tighter rows,
            sticky header, zebra rows, plates as licence plates. */}
        <table className="min-w-[1100px] w-full text-[13px] [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-2">
          <thead className="bg-gray-100 text-gray-700 text-xs sticky top-0 z-10 shadow-sm">
            <tr>
              {['נפתח', 'רכב / לקוח', 'חברה', 'סוג', 'לגבייה', 'צ׳ק (צד ג׳)', 'אישור תשלום', 'מועד פירעון צ׳ק', 'סטטוס', 'ימי עבודה', ''].map((h, i) => (
                <th key={h || i} className="text-right font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 [&>tr:nth-child(even)]:bg-gray-50/60">
            {shown.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center text-gray-400 py-8">
                  {cases.length === 0 ? 'עוד לא נפתחו תיקי תביעה — לוחצים "📂 פתיחת תיק"' : 'אין תיקים בתצוגה הזו'}
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
                    <Link href={`/collections/${c.id}`} onClick={(e) => e.stopPropagation()} className="inline-block">
                      <LicensePlate plate={c.plate} size="sm" />
                    </Link>
                    {c.vehicle_type && <div className="text-[11px] text-gray-600">{shortVehicle(c.vehicle_type)}</div>}
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
                        {c.legal_reason ? `${c.legal_reason} · ` : ''}{c.legal_lawyer ?? ''} · {c.legal_sent_on ? formatDate(c.legal_sent_on) : ''} · {ils(c.legal_claim_amount)}
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
      )}

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

/** "פתיחת תיק" — collections, or (legal) the "⚖️ טיפול משפטי" screen: same
 *  lookup by plate → accident date → existing case or a new one; in legal mode
 *  an existing case moves to legal, a new one opens straight into legal. */
export function OpenCaseDialog({ isCeo, collectors, onClose, legal = false }: { isCeo: boolean; collectors: { id: string; name: string }[]; onClose: () => void; legal?: boolean }) {
  const router = useRouter();
  const [lg, setLg] = useState({ reason: '', other: '', lawyer: '', sent_on: today(), claim_amount: '' });
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const legalReason = lg.reason === OTHER ? (lg.other.trim() ? `אחר: ${lg.other.trim()}` : '') : lg.reason;
  const [plate, setPlate] = useState('');
  const [matches, setMatches] = useState<PlateMatch[] | null>(null);
  const [history, setHistory] = useState<{ existing: ExistingCollection[]; repairs: RepairMatch[] } | null>(null);
  // The same car can have several accidents (Amit, 14/10): when it already has
  // a case, ask first — same accident (open it) or a new one.
  const [newAccident, setNewAccident] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [repair, setRepair] = useState<RepairMatch | null>(null);
  const [form, setForm] = useState<CaseInput | null>(null);
  const [extra, setExtra] = useState({ event_date: '', claim_number: '', customer_phone: '', appraiser_name: '' });
  const [assignTo, setAssignTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function search() {
    setErr(null);
    setBusy(true);
    const [r, h] = await Promise.all([lookupPlateForCollection(plate), lookupPlateHistory(plate)]);
    setBusy(false);
    if (r.error || h.error) return setErr(r.error ?? h.error ?? null);
    setMatches(r.matches);
    setHistory({ existing: h.existing, repairs: h.repairs });
    setNewAccident(h.existing.length === 0);
    setPicked(null);
    setRepair(null);
    setForm(null);
    setMoveTarget(null);
  }

  /** Start from a repair case: everything typed there comes along. */
  function chooseRepair(m: RepairMatch) {
    setRepair(m);
    const def = financeDefaultsFromSubType(m.sub_claim_type);
    setForm((f) => ({
      ...(f ?? blankCase(plate.replace(/\D/g, ''))),
      customer_name: f?.customer_name || m.customer_name,
      insurer: f?.insurer || m.insurer,
      work_source: f && picked ? f.work_source : def.workSource ?? 'DIRECT',
      claim_type: f?.claim_type || def.claimType || null,
    }));
    setExtra((x) => ({
      event_date: m.event_date ?? x.event_date,
      claim_number: m.claim_number ?? x.claim_number,
      customer_phone: m.phone ?? x.customer_phone,
      appraiser_name: m.appraiser_name ?? x.appraiser_name,
    }));
  }

  /** Closure data (amounts, invoice) for the same car. */
  function chooseClosure(m: PlateMatch) {
    setPicked(m.finance_closure_id);
    setForm((f) => ({
      plate: m.plate,
      customer_name: m.customer_name ?? f?.customer_name ?? null,
      work_source: m.work_source,
      insurer: m.insurer ?? f?.insurer ?? null,
      claim_type: m.claim_type ?? f?.claim_type ?? null,
      case_closed_on: m.case_closed_on,
      invoice_number: m.invoice_number,
      amount_due: m.amount_due,
      vat_offset: m.vat_offset,
      reinstatement: m.reinstatement,
      claim_check_due_date: m.claim_check_due_date,
      claim_check_amount: m.claim_check_amount,
    }));
  }

  function manual() {
    setPicked(null);
    setRepair(null);
    setForm(blankCase(plate.replace(/\D/g, '')));
  }

  async function moveToLegal() {
    if (!moveTarget) return;
    if (!legalReason) return setErr('נא לבחור סיבה לטיפול המשפטי');
    setBusy(true);
    setErr(null);
    const r = await updateCollectionCase(moveTarget, {
      status: 'LEGAL',
      claim_stage: 'טיפול משפטי',
      legal_reason: legalReason,
      legal_lawyer: lg.lawyer || null,
      legal_sent_on: lg.sent_on || today(),
      legal_claim_amount: num(lg.claim_amount),
    });
    setBusy(false);
    if (r.error) return setErr(r.error);
    onClose();
    router.push(`/collections/${moveTarget}`);
  }

  async function save() {
    if (!form) return;
    if (legal && !legalReason) return setErr('נא לבחור סיבה לטיפול המשפטי');
    setBusy(true);
    setErr(null);
    const r = await openCollectionCase({
      ...form,
      finance_closure_id: picked,
      assign_to: isCeo ? assignTo || null : null,
      case_id: repair?.case_id ?? null,
      event_date: extra.event_date || null,
      claim_number: extra.claim_number || null,
      customer_phone: extra.customer_phone || null,
      appraiser_name: extra.appraiser_name || null,
      legal: legal ? { reason: legalReason, lawyer: lg.lawyer || null, sent_on: lg.sent_on || null, claim_amount: num(lg.claim_amount) } : null,
    });
    setBusy(false);
    if (r.error) return setErr(r.error);
    onClose();
    if (r.id) router.push(`/collections/${r.id}`);
    else router.refresh();
  }

  const box = 'w-full text-right rounded-lg border px-3 py-2 text-sm';
  const inp = 'w-full h-9 px-2 rounded-lg border border-gray-300 text-sm bg-white';
  const lab = 'block text-[11px] text-gray-500 mb-0.5';
  const existing = history?.existing ?? [];
  const repairs = history?.repairs ?? [];

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-2" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl p-4 space-y-3 max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">{legal ? '⚖️ פתיחת תיק משפטי' : '📂 פתיחת תיק תביעה'}</h2>
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
            {busy && !form ? '…' : 'חיפוש'}
          </button>
        </div>

        {/* 1. The car already has a collection case: same accident or a new one? */}
        {existing.length > 0 && !newAccident && (
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 space-y-2">
            <p className="font-bold text-amber-900">⚠️ לרכב הזה כבר יש {existing.length === 1 ? 'תיק תביעה' : `${existing.length} תיקי תביעה`}. זה אותו אירוע או תאונה חדשה?</p>
            {existing.map((x) => (
              <div key={x.id} className="rounded-lg bg-white border border-amber-200 p-2 space-y-1">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
                  <dt className="text-gray-400">תאריך התאונה:</dt>
                  <dd>{x.event_date ? formatDate(x.event_date) : '—'}</dd>
                  <dt className="text-gray-400">נפתח:</dt>
                  <dd>{formatDate(x.opened_at)}</dd>
                  <dt className="text-gray-400">מספר תביעה:</dt>
                  <dd>{x.claim_number ?? '—'}</dd>
                  <dt className="text-gray-400">מצב:</dt>
                  <dd>{x.closed ? 'נסגר' : x.claim_stage ?? STATUS_LABEL[x.status as CollectionStatus] ?? x.status}</dd>
                  <dt className="text-gray-400">מטפלת:</dt>
                  <dd>{x.assigned_name ?? '—'}</dd>
                </dl>
                {x.mine && legal && x.status !== 'LEGAL' ? (
                  <button type="button" onClick={() => setMoveTarget(x.id)} className={`inline-flex items-center h-9 px-4 rounded-lg text-sm font-semibold ${moveTarget === x.id ? 'bg-purple-700 text-white' : 'bg-gray-900 text-white'}`}>
                    ⚖️ זה אותו אירוע — להעביר את התיק הזה למשפטי
                  </button>
                ) : x.mine ? (
                  <Link href={`/collections/${x.id}`} className="inline-flex items-center h-9 px-4 rounded-lg bg-gray-900 text-white text-sm font-semibold">
                    📂 זה אותו אירוע — לפתיחת התיק{x.status === 'LEGAL' ? ' (כבר במשפטי)' : ''}
                  </Link>
                ) : (
                  <p className="text-xs text-gray-600">התיק בטיפול של {x.assigned_name ?? 'מסלקת אחרת'}. אם זה אותו אירוע, אין צורך לפתוח תיק חדש.</p>
                )}
              </div>
            ))}
            <button type="button" onClick={() => { setNewAccident(true); setMoveTarget(null); }} className="h-10 px-4 rounded-lg border-2 border-gray-900 bg-white text-sm font-bold">
              ➕ זו תאונה אחרת — פתיחת תיק חדש
            </button>
          </div>
        )}

        {legal && moveTarget && !newAccident && (
          <>
            <LegalFields lg={lg} set={(p) => setLg({ ...lg, ...p })} />
            <button type="button" onClick={() => void moveToLegal()} disabled={busy} className="w-full h-12 rounded-xl bg-purple-700 text-white text-base font-bold disabled:opacity-50">
              {busy ? 'שומר…' : '⚖️ העברה לטיפול משפטי'}
            </button>
          </>
        )}

        {/* 2. Pull what we already have: the repair case (accident date) and the closure data. */}
        {history && newAccident && (
          <div className="space-y-3">
            {repairs.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-semibold">מאיזו תאונה? (תיקי תיקון של הרכב — הנתונים והמסמכים הסרוקים יעברו לתיק)</p>
                {repairs.map((m) => (
                  <button key={m.case_id} type="button" onClick={() => chooseRepair(m)} className={`${box} ${repair?.case_id === m.case_id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
                    <span className="font-semibold">תאונה: {m.event_date ? formatDate(m.event_date) : 'לא הוזן'}</span>
                    <span className="text-gray-500"> · נפתח: {m.opened_at ? formatDate(m.opened_at) : '—'}</span>
                    {m.branch_name && <span className="text-gray-500"> · {m.branch_name}</span>}
                    {m.insurer && <span className="text-gray-500"> · {m.insurer}</span>}
                    {m.claim_number && <span className="text-gray-500"> · תביעה {m.claim_number}</span>}
                    <span className="text-gray-500"> · מסמכים סרוקים: {m.docs}</span>
                  </button>
                ))}
              </div>
            )}
            {matches && matches.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-semibold">נתוני סגירה (סכומים וחשבונית):</p>
                {matches.map((m) => (
                  <button
                    key={m.finance_closure_id}
                    type="button"
                    disabled={!!m.taken_by}
                    onClick={() => chooseClosure(m)}
                    className={`${box} ${picked === m.finance_closure_id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'} disabled:opacity-50`}
                  >
                    נסגר {formatDate(m.case_closed_on)} · {m.branch_name ?? ''} · {payerOf(m) || '—'} · {m.claim_type ?? ''} · {ils(m.amount_due)}
                    {m.taken_by && <span className="text-red-700"> · כבר בתיק תביעה של {m.taken_by}</span>}
                  </button>
                ))}
              </div>
            )}
            {repairs.length === 0 && (!matches || matches.length === 0) && <p className="text-sm text-amber-700">אין לרכב הזה נתונים במערכת — ממלאים ידנית.</p>}
            {!form && (
              <button type="button" onClick={manual} className="text-xs text-indigo-700 underline">
                להמשיך בלי לבחור — הקלדה ידנית
              </button>
            )}
          </div>
        )}

        {form && newAccident && (
          <>
            <p className="text-xs text-gray-500">{repair || picked ? 'הנתונים נשלפו מהמערכת — אפשר להשלים או לתקן:' : 'הקלדה ידנית:'}</p>
            <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
              <div>
                <label className={lab}>תאריך התאונה</label>
                <input type="date" value={extra.event_date} onChange={(e) => setExtra({ ...extra, event_date: e.target.value })} className={inp} />
              </div>
              <div>
                <label className={lab}>מספר תביעה בחברה</label>
                <input value={extra.claim_number} onChange={(e) => setExtra({ ...extra, claim_number: e.target.value })} className={inp} dir="ltr" />
              </div>
              <div>
                <label className={lab}>טלפון הלקוח</label>
                <input value={extra.customer_phone} onChange={(e) => setExtra({ ...extra, customer_phone: e.target.value })} className={inp} dir="ltr" inputMode="tel" />
              </div>
              <div>
                <label className={lab}>שמאי</label>
                <input value={extra.appraiser_name} onChange={(e) => setExtra({ ...extra, appraiser_name: e.target.value })} className={inp} />
              </div>
            </div>
            <CaseFields v={form} set={(p) => setForm({ ...form, ...p })} />
            {legal && <LegalFields lg={lg} set={(p) => setLg({ ...lg, ...p })} />}
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
              {busy ? 'שומר…' : legal ? '⚖️ פתח תיק משפטי' : 'פתח תיק'}
            </button>
          </>
        )}
        {err && <p className="text-sm text-red-600">⚠️ {err}</p>}
      </div>
    </div>
  );
}

/** One claim as a card — the "כרטיסים" view, like the repair cases list. Every value with its label. */
function ClaimCard({ c, exp, late, t0, showCollector }: { c: CollectionCase; exp: { date: string | null; basis: string }; late: boolean; t0: string; showCollector: boolean }) {
  return (
    <Link href={`/collections/${c.id}`} className={`block rounded-2xl border bg-white p-3 space-y-2 hover:shadow-md transition-shadow ${late ? 'border-red-300' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <LicensePlate plate={c.plate} size="md" />
          {c.vehicle_type && <p className="text-xs text-gray-600 mt-1 truncate">{shortVehicle(c.vehicle_type)}</p>}
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${STATUS_CHIP[c.status]}`}>{STATUS_LABEL[c.status]}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-sm">
        <dt className="text-gray-400">לקוח:</dt>
        <dd className="truncate">{c.customer_name ?? '—'}</dd>
        <dt className="text-gray-400">משלם:</dt>
        <dd className="truncate">{payerOf(c) || '—'}</dd>
        <dt className="text-gray-400">מצב:</dt>
        <dd className="truncate text-indigo-700 font-semibold">{c.claim_stage ?? '—'}</dd>
        <dt className="text-gray-400">לגבייה:</dt>
        <dd className="font-bold">{ils(toCollect(c))}</dd>
        <dt className="text-gray-400">מועד פירעון:</dt>
        <dd className={late ? 'text-red-700 font-semibold' : ''}>
          {c.received_on ? `שולם ${formatDate(c.received_on)}` : exp.date ? `${formatDate(exp.date)}${late ? ` · ⏰ ${daysLate(exp.date, t0)} ימים` : ''}` : '—'}
        </dd>
        {showCollector && (
          <>
            <dt className="text-gray-400">מסלקת:</dt>
            <dd className="truncate">{c.assigned_name ?? '—'}</dd>
          </>
        )}
      </dl>
    </Link>
  );
}

type LegalForm = { reason: string; other: string; lawyer: string; sent_on: string; claim_amount: string };

/** Why it goes to legal (Amit: "סיבת התביעה המשפטית — הפרשים וכדומה") + lawyer, date, amount. */
function LegalFields({ lg, set }: { lg: LegalForm; set: (p: Partial<LegalForm>) => void }) {
  const inp = 'w-full h-9 px-2 rounded-lg border border-gray-300 text-sm bg-white';
  const lab = 'block text-[11px] text-gray-500 mb-0.5';
  return (
    <div className="rounded-xl border-2 border-purple-200 bg-purple-50/50 p-3 space-y-2">
      <p className="text-sm font-bold text-purple-900">⚖️ פרטי הטיפול המשפטי</p>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <label className={lab}>סיבת התביעה המשפטית *</label>
          <select value={lg.reason} onChange={(e) => set({ reason: e.target.value })} className={inp}>
            <option value="">— בחירה —</option>
            {LEGAL_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
            <option value={OTHER}>אחר — מלל חופשי</option>
          </select>
        </div>
        {lg.reason === OTHER && (
          <div>
            <label className={lab}>פירוט הסיבה *</label>
            <input value={lg.other} onChange={(e) => set({ other: e.target.value })} maxLength={180} className={inp} />
          </div>
        )}
        <div>
          <label className={lab}>סכום התביעה / ההפרש (₪)</label>
          <input value={lg.claim_amount} onChange={(e) => set({ claim_amount: e.target.value })} inputMode="decimal" dir="ltr" className={inp} />
        </div>
        <div>
          <label className={lab}>עורך דין</label>
          <input value={lg.lawyer} onChange={(e) => set({ lawyer: e.target.value })} className={inp} />
        </div>
        <div>
          <label className={lab}>תאריך העברה למשפטי</label>
          <input type="date" value={lg.sent_on} onChange={(e) => set({ sent_on: e.target.value })} className={inp} />
        </div>
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
          צפי התשלום בפוליסה / הסדר ג׳ מחושב מתאריך אישור התשלום לפי ההסכם. {canEdit ? 'אפשר לערוך ולהוסיף חברה.' : 'עריכה — עמית וחני בלבד.'}
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
