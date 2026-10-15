'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  attachInvoicePhoto,
  cancelPartReturn,
  createPartReturn,
  readPartSticker,
  handOverToDriver,
  markCredited,
  markDispute,
  type PartReturnRow,
} from '@/app/actions/partReturns';
import { PART_RETURN_ALERT_DAYS, PART_RETURN_REASONS, PART_RETURN_STATUS_LABEL, PART_RETURN_SUPPLIERS } from '@/lib/partReturns';
import { shrinkImage } from '@/lib/shrinkImage';
import { SignaturePad } from '@/components/SignaturePad';
import { formatDate, formatDateTime } from '@/lib/dates';
import type { SupplierDocRow } from '@/app/actions/supplierDocs';
import { DocsTable, SupplierDocsTab, docLines, matchesDoc } from './SupplierDocsTab';
import { BranchFilter, StatCard, StatGrid, ils, EmptyState } from '@/components/ui/kit';
import { reportError } from '@/components/ErrorReporter';

type Tab = 'pickup' | 'credit' | 'done' | 'all' | 'docs';

const HANDOVER_ROLES = new Set(['CEO', 'SERVICE_ADVISOR', 'SERVICE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_MANAGER']);
const CREDIT_ROLES = new Set(['CEO', 'WAREHOUSE_MANAGER', 'ACCOUNTANT']);

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function ReturnsClient({
  rows: allRows,
  role,
  branches,
  error,
  docs = [],
}: {
  rows: PartReturnRow[];
  role: string;
  branches: { id: string; name: string }[];
  error?: string;
  /** Supplier invoices / delivery notes archive (null = no access to it). */
  docs?: SupplierDocRow[] | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('pickup');
  const [adding, setAdding] = useState(false);
  // ?new=1 (the main button on "היום", 16/10) opens the new-return form straight away.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === '1') setAdding(true);
  }, []);
  const [toast, setToast] = useState<string | null>(null);
  const canHandOver = HANDOVER_ROLES.has(role);
  // Painters (Amit, 14/10): mark returns + photograph documents. No tracking,
  // no table, no search — the warehouse and Roey do the rest.
  const isPainter = role === 'PAINTER';
  const canCredit = CREDIT_ROLES.has(role);

  // Branch filter (Liron 15/10: "אין סינון בין הסניפים") — every tab, count and
  // search follows it; remembered on this device.
  const branchNames = useMemo(() => Array.from(new Set(allRows.map((r) => r.branch_name).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'he')), [allRows]);
  const [branch, setBranchState] = useState('');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('returns-branch') ?? '';
      if (saved && branchNames.includes(saved)) setBranchState(saved);
    } catch {
      /* no storage — show all */
    }
  }, [branchNames]);
  function setBranch(b: string) {
    setBranchState(b);
    try {
      localStorage.setItem('returns-branch', b);
    } catch {
      /* ignore */
    }
  }
  const rows = useMemo(() => (branch ? allRows.filter((r) => r.branch_name === branch) : allRows), [allRows, branch]);

  const waiting = rows.filter((r) => r.status === 'WAITING_PICKUP');
  const forCredit = rows.filter((r) => r.status === 'COLLECTED' || r.status === 'DISPUTE');
  const done = rows.filter((r) => r.status === 'CREDITED');
  const summary = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }) : '');
    const month = today.slice(0, 7);
    const credited = done.filter((r) => day(r.credited_at).startsWith(month));
    return {
      pickup7: waiting.filter((r) => daysSince(r.created_at) > 7).length,
      pickup14: waiting.filter((r) => daysSince(r.created_at) > 14).length,
      credit14: forCredit.filter((r) => r.collected_at && daysSince(r.collected_at) > 14).length,
      monthCount: credited.length,
      monthSum: credited.reduce((s, r) => s + (r.credit_amount ?? 0), 0),
      todayMarked: rows.filter((r) => day(r.created_at) === today).length,
      todayCollected: rows.filter((r) => day(r.collected_at) === today).length,
      todayCredited: rows.filter((r) => day(r.credited_at) === today).length,
    };
  }, [rows, waiting, forCredit, done]);
  // Search over everything (Amit: a part or a credit shows up a month or two
  // later — "was this returned or not?"): part, SKU, invoice numbers, plate…
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const found = useMemo(
    () =>
      q
        ? rows.filter((r) =>
            [r.description, r.sku, r.plate, r.customer_name, r.supplier_label, r.document_number, r.credit_invoice_number, r.driver_name, r.reason_label, r.notes, r.external_ref, r.delivery_note_number, r.created_by_name]
              .some((v) => (v ?? '').toLowerCase().includes(q)),
          )
        : rows,
    [rows, q],
  );
  const canDocs = docs !== null;
  const lines = useMemo(() => (canDocs ? docLines(docs ?? [], rows) : []), [canDocs, docs, rows]);
  const foundDocs = useMemo(() => (q ? lines.filter((l) => matchesDoc(l, q)) : []), [lines, q]);
  const invoiceLookup = useMemo(() => makeInvoiceLookup(docs ?? []), [docs]);

  function done_(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
    router.refresh();
  }

  return (
    <InvoiceLookup.Provider value={invoiceLookup}>
    <div className="max-w-5xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📦 החזרת חלקים</h1>
          <p className="text-sm text-gray-500">
            {role === 'PAINTER' ? 'החלקים שסימנת להחזרה' : 'סימון, מסירה לנהג הספק וזיכוי'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="px-5 py-3 bg-red-600 text-white rounded-xl text-base font-bold shadow-sm hover:bg-red-700"
        >
          📷 חלק להחזרה
        </button>
      </div>

      {branchNames.length > 1 && (
        <BranchFilter branches={branchNames.map((b) => ({ id: b, name: `${b} (${allRows.filter((r) => r.branch_name === b).length})` }))} value={branch} onChange={setBranch} />
      )}

      {/* Summary strip (Amit 15/10: "דשבורד שמסכם את כל פעילות ההחזרות עם עדכונים
          יומיים") — the shared kit; a card opens its tab. */}
      {!isPainter && !q && (
        <StatGrid>
          <StatCard label="ממתין לאיסוף" value={waiting.length} hint={`${summary.pickup7} מעל 7 ימים · ${summary.pickup14} מעל 14`} tone={summary.pickup14 ? 'bad' : summary.pickup7 ? 'warn' : 'neutral'} onClick={() => setTab('pickup')} active={tab === 'pickup'} />
          <StatCard label="נאסף — ממתין לזיכוי" value={forCredit.length} hint={`${summary.credit14} מעל 14 ימים מהאיסוף`} tone={summary.credit14 ? 'warn' : 'neutral'} onClick={() => setTab('credit')} active={tab === 'credit'} />
          <StatCard label="זוכו החודש" value={summary.monthCount} hint={ils(summary.monthSum)} tone="good" onClick={() => setTab('done')} active={tab === 'done'} />
          <StatCard label="היום — סומנו להחזרה" value={summary.todayMarked} hint={`${summary.todayCollected} נאספו · ${summary.todayCredited} זוכו`} tone="info" onClick={() => setTab('all')} active={tab === 'all'} />
        </StatGrid>
      )}

      {toast && <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 px-4 py-2 text-sm font-semibold">{toast}</div>}
      {error && <p className="text-sm text-red-600">⚠️ {error}</p>}

      {!isPainter && (
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='🔎 חיפוש: שם חלק, מק"ט, מספר חשבונית / ת. משלוח, ספק, מספר רכב…'
          className="w-full h-11 pr-3 pl-10 rounded-xl border border-gray-300 text-sm"
          dir="auto"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-label="נקה חיפוש">
            ✕
          </button>
        )}
      </div>
      )}

      {q && !isPainter ? (
        <>
          <p className="text-sm text-gray-600">נמצאו {found.length} החזרות{canDocs ? ` · ${foundDocs.length} חשבוניות / ת. משלוח` : ''}</p>
          <ReturnsTable rows={found} onDone={done_} canCredit={canCredit} />
          {foundDocs.length > 0 && (
            <>
              <h3 className="text-sm font-bold text-gray-700 pt-2">🧾 חשבוניות / ת. משלוח</h3>
              <DocsTable rows={foundDocs} onDone={done_} />
            </>
          )}
        </>
      ) : (
      <>
      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        {(isPainter
          ? ([
              ['pickup', `ממתין לאיסוף (${waiting.length})`],
              ...(canDocs ? [['docs', '🧾 צילום חשבוניות / ת. משלוח'] as [Tab, string]] : []),
            ] as [Tab, string][])
          : ([
              ['pickup', `ממתין לאיסוף (${waiting.length})`],
              ['credit', `ממתין לזיכוי (${forCredit.length})`],
              ['done', `זוכה (${done.length})`],
              ['all', `📋 טבלה (${rows.length})`],
              ...(canDocs ? [['docs', `🧾 חשבוניות / ת. משלוח (${lines.length})`] as [Tab, string]] : []),
            ] as [Tab, string][])).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${
              tab === k ? 'border-red-600 text-red-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'pickup' && (
        <PickupTab
          rows={waiting}
          canHandOver={canHandOver}
          onDone={done_}
          // After the hand-over the parts are in "ממתין לזיכוי" — show them there.
          onHandedOver={() => setTab('credit')}
        />
      )}
      {tab === 'credit' && <CreditTab rows={forCredit} canCredit={canCredit} onDone={done_} />}
      {tab === 'done' && (
        <div className="grid gap-3 md:grid-cols-2">
          {done.length === 0 && <EmptyState className="md:col-span-2" title="אין עדיין זיכויים" hint="החזרות שהספק זיכה עליהן יופיעו כאן" />}
          {done.map((r) => (
            <PartCard key={r.id} r={r}>
              <Fields className="mt-1 pt-1 border-t border-gray-100">
                <Field label="✓ זוכה בתאריך" tone="text-green-700 font-semibold">{r.credited_at ? formatDate(r.credited_at) : '—'}</Field>
                <Field label="מספר חשבונית זיכוי">{r.credit_invoice_number ?? '—'}</Field>
                {r.credit_amount != null && <Field label="סכום הזיכוי">₪{r.credit_amount.toLocaleString('he-IL')}</Field>}
              </Fields>
              <InvoiceButtons r={r} canCredit={canCredit} onDone={done_} />
            </PartCard>
          ))}
        </div>
      )}
      {tab === 'all' && <ReturnsTable rows={rows} onDone={done_} canCredit={canCredit} />}
      {tab === 'docs' && canDocs && <SupplierDocsTab lines={isPainter ? lines.filter((l) => l.source === 'archive') : lines} branches={branches} onDone={done_} canVerify={!isPainter} />}
      </>
      )}

      {adding && (
        <NewReturnForm
          branches={branches}
          onClose={() => setAdding(false)}
          onSaved={(linked) => {
            setAdding(false);
            setTab('pickup');
            done_(linked ? 'נשמר ✓ החלק חובר לתיק של הרכב' : 'נשמר ✓');
          }}
        />
      )}
    </div>
    </InvoiceLookup.Provider>
  );
}

// ---- Which invoice a return credits (Amit, 2026-10-14) -------------------
// The invoice number printed on the sticker → the invoice photographed in the
// "חשבוניות / ת. משלוח" tab. Numbers are compared without spaces/case; a
// sticker number with a line suffix ("HZM2769725-01") also matches its invoice.
const normDoc = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, '');

type Lookup = (r: PartReturnRow) => SupplierDocRow | null;
const InvoiceLookup = createContext<Lookup>(() => null);

function makeInvoiceLookup(docs: SupplierDocRow[]): Lookup {
  const invoices = docs.filter((d) => d.doc_type !== 'CREDIT_INVOICE' && d.doc_number);
  return (r) => {
    const n = normDoc(r.document_number);
    if (!n) return null;
    const hits = invoices.filter((d) => {
      const m = normDoc(d.doc_number);
      return m === n || n.startsWith(`${m}-`) || n.startsWith(`${m}/`);
    });
    return hits.find((d) => d.supplier === r.supplier_label) ?? hits[0] ?? null;
  };
}

/** "🔗 מזכה חשבונית X" — opens the photographed invoice when it is in the archive. */
function CreditsInvoice({ r, compact = false }: { r: PartReturnRow; compact?: boolean }) {
  const lookup = useContext(InvoiceLookup);
  const [view, setView] = useState<string | null>(null);
  if (!r.document_number && !r.invoice_url) return null;
  const doc = lookup(r);
  const url = doc?.photo_url ?? r.invoice_url;
  const label = `🔗 מזכה חשבונית ${r.document_number ?? ''}`.trim();
  return (
    <span className={compact ? '' : 'inline-flex'}>
      {url ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setView(url); }}
          className={compact ? 'text-blue-700 underline decoration-dotted' : 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold border-blue-200 bg-blue-50 text-blue-800'}
          title={doc ? `צולמה ${formatDate(doc.doc_date)}${doc.branch_name ? ` · ${doc.branch_name}` : ''}` : undefined}
        >
          {label}
        </button>
      ) : (
        <span className={compact ? 'text-gray-700' : 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold border-gray-200 bg-gray-50 text-gray-700'}>
          {label}
          <span className="text-gray-400 font-normal"> · לא צולמה</span>
        </span>
      )}
      {view && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); setView(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view} alt="חשבונית" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </span>
  );
}

function PartCard({ r, children, selected, onToggle }: { r: PartReturnRow; children?: React.ReactNode; selected?: boolean; onToggle?: () => void }) {
  const [zoom, setZoom] = useState(false);
  const age = daysSince(r.created_at);
  const late = r.status === 'WAITING_PICKUP' && age >= PART_RETURN_ALERT_DAYS.manager;
  return (
    <div
      className={`flex gap-3 rounded-xl border p-3 bg-white ${selected ? 'border-red-500 ring-2 ring-red-200' : late ? 'border-amber-300' : 'border-gray-200'} ${onToggle ? 'cursor-pointer' : ''}`}
      onClick={onToggle}
    >
      {onToggle && (
        <span className={`w-7 h-7 shrink-0 rounded-md border-2 flex items-center justify-center text-sm font-bold ${selected ? 'bg-red-600 border-red-600 text-white' : 'border-gray-300'}`}>
          {selected ? '✓' : ''}
        </span>
      )}
      {r.photo_url ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setZoom(true);
          }}
          className="shrink-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.photo_url} alt="מדבקה" className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
        </button>
      ) : (
        <div className="w-20 h-20 rounded-lg bg-gray-100 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        {/* Every value on its own line with its name (Amit, 2026-10-14):
            top to bottom, never a run of values one after another. */}
        <Fields>
          <Field label="חלק" strong>{r.description || '—'}</Field>
          <Field label="ספק">{r.supplier_label}</Field>
          <Field label="מק״ט"><span dir="ltr">{r.sku || '—'}</span></Field>
          <Field label="כמות">{r.quantity}</Field>
          <Field label="סיבה">{r.reason_label}</Field>
          <Field label="רכב">
            {r.case_id ? (
              <Link href={`/go/${r.case_id}`} onClick={(e) => e.stopPropagation()} className="text-indigo-700 font-semibold">
                {r.plate}{r.customer_name ? ` (${r.customer_name})` : ''}
              </Link>
            ) : r.plate ? (
              `${r.plate} (ללא תיק פתוח)`
            ) : (
              'כללי — לא שייך לרכב'
            )}
          </Field>
          {r.branch_name && <Field label="סניף">{r.branch_name}</Field>}
          {r.external_ref && <Field label="מספר מעקב (אקסל)"><span dir="ltr">{r.external_ref}</span></Field>}
          {r.delivery_note_number && <Field label="תעודת משלוח"><span dir="ltr">{r.delivery_note_number}</span></Field>}
          <Field label="סומן להחזרה ע״י">{r.created_by_name ?? '—'}</Field>
          <Field label="תאריך סימון">{formatDateTime(r.created_at)}</Field>
          {r.status === 'WAITING_PICKUP' && (
            <Field label="ממתין לאיסוף" tone={late ? 'text-amber-700 font-semibold' : undefined}>{age} ימים</Field>
          )}
          {r.sticker_date && <Field label="תאריך על המדבקה">{formatDate(r.sticker_date)}</Field>}
        </Fields>
        {children}
      </div>
      {zoom && r.photo_url && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); setZoom(false); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.photo_url} alt="מדבקה" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

/** Waiting for pickup, grouped by supplier — tap the parts, type the driver once. */
function PickupTab({ rows, canHandOver, onDone, onHandedOver }: { rows: PartReturnRow[]; canHandOver: boolean; onDone: (m: string) => void; onHandedOver?: () => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, PartReturnRow[]>();
    for (const r of rows) m.set(r.supplier_label, [...(m.get(r.supplier_label) ?? []), r]);
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [rows]);
  const [supplier, setSupplier] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [driver, setDriver] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Driver's signature (Amit, 2026-10-14): signed on the screen at hand-over.
  const [signing, setSigning] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);

  if (rows.length === 0) return <EmptyState good title="אין חלקים שממתינים לאיסוף" hint="כל החלקים נאספו. חלק חדש להחזרה — בכפתור למעלה" />;

  const shown = supplier ? groups.find(([s]) => s === supplier)?.[1] ?? [] : rows;

  function pick(s: string | null, only?: string) {
    setSupplier(s);
    const ofSupplier = s ? groups.find(([g]) => g === s)?.[1] ?? [] : [];
    setSelected(new Set(only ? [only] : ofSupplier.map((r) => r.id)));
    setErr(null);
    // The driver who came last time for this supplier, so usually you only confirm.
    setDriver(s ? lastDriverFor(s) : '');
  }

  async function confirm() {
    setBusy(true);
    setErr(null);
    if (!signature) {
      setBusy(false);
      setErr('חסרה חתימת הנהג');
      return;
    }
    const res = await handOverToDriver(Array.from(selected), driver, signature);
    setBusy(false);
    if ('error' in res && res.error) {
      setErr(res.error);
      return;
    }
    setSigning(false);
    setSignature(null);
    try {
      if (supplier) localStorage.setItem(`returns-driver:${supplier}`, driver.trim());
    } catch {
      /* storage unavailable — only a convenience */
    }
    setSelected(new Set());
    onDone(`נמסרו לנהג ${driver.trim()}: ${'updated' in res ? res.updated : selected.size} חלקים ✓ — מופיעים עכשיו ב"ממתין לזיכוי"`);
    onHandedOver?.();
  }

  return (
    <div className="space-y-3">
      {canHandOver && !supplier && (
        <div className="rounded-xl border-2 border-dashed border-red-300 bg-red-50/50 p-3 text-sm text-gray-800">
          <p className="font-bold text-red-800">🚚 מסירה לנהג והחתמה</p>
          <p className="mt-0.5">
            1. בחרו את הספק שהנהג שלו הגיע (כאן למטה, או בכפתור על החלק) · 2. סמנו את החלקים שהוא לוקח · 3. כתבו את שם הנהג · 4. לחצו &quot;✍️ החתמת נהג ומסירה&quot; — הנהג חותם באצבע.
          </p>
        </div>
      )}

      {canHandOver && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-600 self-center ml-1 font-semibold">{supplier ? 'ספק:' : 'בחרו ספק:'}</span>
          {groups.map(([s, list]) => (
            <button
              key={s}
              type="button"
              onClick={() => pick(supplier === s ? null : s)}
              className={`px-4 py-2 rounded-xl border-2 text-sm font-bold ${supplier === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-800 border-gray-300'}`}
            >
              {s} <span className="opacity-70">({list.length})</span>
            </button>
          ))}
        </div>
      )}

      {canHandOver && supplier && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex flex-wrap items-center gap-2 sticky top-28 z-10">
          <button
            type="button"
            onClick={() => setSelected(selected.size === shown.length ? new Set() : new Set(shown.map((r) => r.id)))}
            className="px-3 py-2 rounded-lg bg-white border border-gray-300 text-sm font-semibold"
          >
            {selected.size === shown.length ? 'נקה בחירה' : 'בחר הכל'}
          </button>
          <input
            value={driver}
            onChange={(e) => setDriver(e.target.value)}
            placeholder="שם הנהג"
            className="flex-1 min-w-[140px] h-10 px-3 rounded-lg border border-gray-300 text-sm"
          />
          <button
            type="button"
            disabled={busy || selected.size === 0 || !driver.trim()}
            onClick={() => {
              setErr(null);
              setSignature(null);
              setSigning(true);
            }}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold disabled:opacity-40"
          >
            {busy ? 'שומר…' : `✍️ החתמת נהג ומסירה (${selected.size})`}
          </button>
          {!busy && (selected.size === 0 || !driver.trim()) && (
            <span className="text-xs text-red-700 w-full">
              {selected.size === 0 ? 'סמנו את החלקים שהנהג לוקח' : 'כתבו את שם הנהג'} — ואז אפשר להחתים
            </span>
          )}
          {err && !signing && <span className="text-sm text-red-700 w-full">⚠️ {err}</span>}
        </div>
      )}

      {signing && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-2" onClick={() => !busy && setSigning(false)}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">✍️ חתימת הנהג</h2>
              <button type="button" onClick={() => setSigning(false)} disabled={busy} className="text-gray-400 text-xl" aria-label="סגור">✕</button>
            </div>
            <p className="text-sm text-gray-700">
              אני, <b>{driver.trim()}</b>, מאשר/ת שקיבלתי {selected.size} {selected.size === 1 ? 'חלק' : 'חלקים'} להחזרה לספק <b>{supplier}</b>.
            </p>
            <SignaturePad onChange={setSignature} />
            {err && <p className="text-sm text-red-700">⚠️ {err}</p>}
            <button
              type="button"
              disabled={busy || !signature}
              onClick={() => void confirm()}
              className="w-full h-12 rounded-xl bg-red-600 text-white text-base font-bold disabled:opacity-40"
            >
              {busy ? 'שומר…' : `אישור מסירה (${selected.size})`}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((r) => (
          <PartCard
            key={r.id}
            r={r}
            selected={selected.has(r.id)}
            onToggle={
              canHandOver && supplier
                ? () =>
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (n.has(r.id)) n.delete(r.id);
                      else n.add(r.id);
                      return n;
                    })
                : undefined
            }
          >
            {!supplier && <InvoiceButtons r={r} canCredit={false} onDone={onDone} />}
            {canHandOver && !supplier && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  pick(r.supplier_label, r.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="mt-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold"
              >
                🚚 מסירה לנהג + חתימה
              </button>
            )}
            {(r.mine || canHandOver) && !supplier && (
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!window.confirm('לבטל את סימון ההחזרה?')) return;
                  const res = await cancelPartReturn(r.id);
                  if ('error' in res && res.error) alert(res.error);
                  else onDone('הסימון בוטל');
                }}
                className="text-[11px] text-gray-400 hover:text-red-600 mt-1"
              >
                ביטול סימון
              </button>
            )}
          </PartCard>
        ))}
      </div>
    </div>
  );
}

function lastDriverFor(supplier: string): string {
  try {
    return localStorage.getItem(`returns-driver:${supplier}`) ?? '';
  } catch {
    return '';
  }
}

/** Collected — waiting for the supplier's credit invoice (Roei / CEO). */
function CreditTab({ rows, canCredit, onDone }: { rows: PartReturnRow[]; canCredit: boolean; onDone: (m: string) => void }) {
  const [open, setOpen] = useState<{ id: string; mode: 'credit' | 'dispute' } | null>(null);
  const [inv, setInv] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [creditPhoto, setCreditPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (rows.length === 0)
    return (
      <div className="text-center py-8 space-y-1">
        <p className="text-gray-500 font-semibold">אין חלקים שממתינים לזיכוי</p>
        <p className="text-sm text-gray-400">חלק מגיע לכאן אחרי שמסרו אותו לנהג של הספק והנהג חתם — בלשונית &quot;ממתין לאיסוף&quot;, בכפתור &quot;🚚 מסירה לנהג + חתימה&quot;.</p>
      </div>
    );

  async function save() {
    if (!open) return;
    setBusy(true);
    setErr(null);
    const res =
      open.mode === 'credit'
        ? await markCredited(open.id, inv, amount.trim() ? Number(amount.replace(/[^\d.]/g, '')) : null)
        : await markDispute(open.id, note);
    if ('error' in res && res.error) {
      setBusy(false);
      setErr(res.error);
      return;
    }
    if (open.mode === 'credit' && creditPhoto) {
      const fd = new FormData();
      fd.append('id', open.id);
      fd.append('kind', 'credit');
      fd.append('photo', await shrinkImage(creditPhoto));
      const up = await attachInvoicePhoto(fd).catch(() => ({ error: 'שגיאה' }));
      if ('error' in up && up.error) alert(`הזיכוי נרשם, אבל תמונת החשבונית לא נשמרה: ${up.error}`);
    }
    setBusy(false);
    setCreditPhoto(null);
    setOpen(null);
    setInv('');
    setAmount('');
    setNote('');
    onDone(open.mode === 'credit' ? 'הזיכוי נרשם ✓' : 'סומן בבירור');
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((r) => (
        <PartCard key={r.id} r={r}>
          <Fields className="mt-1 pt-1 border-t border-gray-100">
            <Field label="🚚 נמסר לנהג">{r.driver_name ?? '—'}</Field>
            <Field label="תאריך מסירה">{r.collected_at ? formatDate(r.collected_at) : '—'}</Field>
            {r.collected_by_name && <Field label="מסר">{r.collected_by_name}</Field>}
            <Field label="ממתין לזיכוי">{r.collected_at ? daysSince(r.collected_at) : 0} ימים</Field>
          </Fields>
          {r.driver_signature_url && <SignatureThumb url={r.driver_signature_url} />}
          {r.status === 'DISPUTE' && <p className="text-xs text-amber-700 font-semibold mt-1">⚠️ בבירור: {r.dispute_note}</p>}
          <InvoiceButtons r={r} canCredit={false} onDone={onDone} />
          {canCredit && open?.id !== r.id && (
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => { setOpen({ id: r.id, mode: 'credit' }); setErr(null); }} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold">
                ✓ זיכוי התקבל
              </button>
              <button type="button" onClick={() => { setOpen({ id: r.id, mode: 'dispute' }); setNote(r.dispute_note ?? ''); setErr(null); }} className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-xs font-semibold">
                בבירור
              </button>
            </div>
          )}
          {open?.id === r.id && (
            <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
              {open.mode === 'credit' ? (
                <>
                  <input value={inv} onChange={(e) => setInv(e.target.value)} placeholder="מספר חשבונית זיכוי" className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm" />
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="סכום הזיכוי ₪ (לא חובה)" className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm" />
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <span className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white font-semibold">📄 {creditPhoto ? 'צולם ✓' : 'צלם חשבונית זיכוי'}</span>
                    <span className="text-gray-400">(לא חובה)</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setCreditPhoto(e.target.files?.[0] ?? null)} />
                  </label>
                </>
              ) : (
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="מה הבעיה עם הזיכוי?" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
              )}
              <div className="flex gap-2 items-center">
                <button type="button" disabled={busy} onClick={() => void save()} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-bold disabled:opacity-40">
                  {busy ? 'שומר…' : 'שמור'}
                </button>
                <button type="button" onClick={() => setOpen(null)} className="text-xs text-gray-500">ביטול</button>
                {err && <span className="text-xs text-red-700">⚠️ {err}</span>}
              </div>
            </div>
          )}
        </PartCard>
      ))}
    </div>
  );
}

/** "📷 חלק להחזרה": photo first (mandatory), then a few taps. */
function NewReturnForm({ branches, onClose, onSaved }: { branches: { id: string; name: string }[]; onClose: () => void; onSaved: (linked: boolean) => void }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [plate, setPlate] = useState('');
  const [general, setGeneral] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [supplierOther, setSupplierOther] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [reasonOther, setReasonOther] = useState('');
  const [doc, setDoc] = useState('');
  const [stickerDate, setStickerDate] = useState('');
  // Sticker reading (Claude): 'reading' while it runs, 'done' after it filled something.
  const [reading, setReading] = useState<'idle' | 'reading' | 'done' | 'empty' | 'off' | 'failed'>('idle');
  // Why the reading failed, as the reader reported it (15/10 — no more guessing).
  const [failDetail, setFailDetail] = useState<string | null>(null);
  const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0].id : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dups, setDups] = useState<{ created_at: string; status: string; plate: string | null; quantity: number; branch_name: string | null }[] | null>(null);
  // Fields filled from the sticker get a "זוהה" mark until the user edits them;
  // after a failed save, the missing required fields are outlined (16/10, design round).
  const [auto, setAuto] = useState<Set<string>>(new Set());
  const [tried, setTried] = useState(false);
  const edited = (k: string) => setAuto((a) => (a.has(k) ? new Set(Array.from(a).filter((x) => x !== k)) : a));

  function onPhoto(f: File | null) {
    setPhoto(f);
    setPreview(f ? URL.createObjectURL(f) : null);
    if (f) void readFromSticker(f);
  }

  // Fill the form from the sticker (Amit, 2026-10-14). Only EMPTY fields are
  // filled — never overwrite what the user already typed. No API key / error:
  // nothing happens and the form stays manual.
  async function readFromSticker(f: File) {
    setReading('reading');
    setFailDetail(null);
    try {
      const fd = new FormData();
      fd.append('photo', await shrinkImage(f, { maxSide: 1600 }));
      const res = await readPartSticker(fd);
      const x = res.fields;
      if (!x) {
        setFailDetail(res.detail ?? null);
        return setReading(res.reason === 'no_key' ? 'off' : res.reason === 'no_result' ? 'empty' : 'failed');
      }
      // Functional updates: the reading takes a few seconds, and anything the
      // user typed meanwhile must win over the sticker.
      let filled = false;
      const got = new Set<string>();
      const fill = (key: string, val: string | null, cur: string, set: React.Dispatch<React.SetStateAction<string>>) => {
        if (!val) return;
        filled = true;
        if (!cur.trim()) got.add(key);
        set((c) => (c.trim() ? c : val));
      };
      if (!general) fill('plate', x.plate, plate, setPlate);
      fill('supplier', x.supplier, supplier, setSupplier);
      if (x.supplier === 'אחר') fill('supplier_other', x.supplier_other, supplierOther, setSupplierOther);
      fill('sku', x.sku, sku, setSku);
      fill('description', x.description, description, setDescription);
      fill('doc', x.document_number, doc, setDoc);
      fill('date', x.sticker_date, stickerDate, setStickerDate);
      setAuto(got);
      if (x.quantity && x.quantity > 1) {
        filled = true;
        setQuantity((q) => (q === 1 ? x.quantity! : q));
      }
      setReading(filled ? 'done' : 'empty');
    } catch (e) {
      // #9: a failure before the server could log it (e.g. the upload itself) → the error monitor.
      reportError('promise', new Error(`קריאת מדבקה (דפדפן): ${e instanceof Error ? e.message : String(e)} · ${f.type || '?'} ${Math.round(f.size / 1024)}KB`));
      setReading('failed');
    }
  }

  async function save(confirmDuplicate = false) {
    setErr(null);
    setDups(null);
    setTried(true);
    if (!photo) return setErr('חובה לצלם את המדבקה');
    if (!supplier) return setErr('נא לבחור ספק');
    if (!reason) return setErr('נא לבחור סיבת החזרה');
    if (!sku.trim() && !description.trim()) return setErr('נא למלא מק"ט או תיאור');
    if (!general && !plate.trim() && !branchId) return setErr('נא לבחור סניף');
    setBusy(true);
    const fd = new FormData();
    fd.append('photo', await shrinkImage(photo));
    fd.append('plate', general ? '' : plate);
    fd.append('supplier', supplier);
    fd.append('supplier_other', supplierOther);
    fd.append('sku', sku);
    fd.append('description', description);
    fd.append('quantity', String(quantity));
    fd.append('reason', reason);
    fd.append('reason_other', reasonOther);
    fd.append('document_number', doc);
    fd.append('sticker_date', stickerDate);
    fd.append('branch_id', branchId);
    if (confirmDuplicate) fd.append('confirm_duplicate', 'yes');
    const res = await createPartReturn(fd).catch((e: unknown) => ({ error: e instanceof Error ? e.message : 'שגיאה' }));
    setBusy(false);
    if ('error' in res && res.error) return setErr(res.error);
    if ('duplicates' in res && res.duplicates?.length) return setDups(res.duplicates);
    onSaved('linkedToCase' in res ? !!res.linkedToCase : false);
  }

  const chip = (on: boolean) => `min-h-[44px] px-3 py-2 rounded-xl border-2 text-sm font-semibold ${on ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-800 border-gray-300'}`;
  // After a save attempt: which required fields are missing (outlined in red).
  const missing = {
    supplier: tried && !supplier,
    reason: tried && !reason,
    item: tried && !sku.trim() && !description.trim(),
    branch: tried && !general && !plate.trim() && !branchId,
  };
  const box = (bad: boolean) => `h-12 px-3 rounded-xl border text-base w-full ${bad ? 'border-red-500 ring-2 ring-red-100' : 'border-gray-300'}`;
  // A field's label: "זוהה מהתמונה" when it came from the sticker, "חובה" when missing.
  const label = (text: string, k?: string, need?: boolean) => (
    <span className="flex items-center gap-2 text-sm font-semibold mb-1.5 text-gray-800">
      {text}
      {k && auto.has(k) && <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-px">זוהה מהתמונה</span>}
      {need && <span className="text-[11px] font-bold text-red-700">חובה</span>}
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center sm:p-6 overflow-y-auto" dir="rtl">
      {/* Phone: full screen, the save button pinned to the bottom (16/10). */}
      <div className="w-full max-w-lg bg-white sm:rounded-2xl shadow-2xl min-h-full sm:min-h-0 flex flex-col">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 h-14 flex items-center justify-between sm:rounded-t-2xl">
          <h2 className="text-lg font-bold">החזרת חלק</h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="w-11 h-11 -me-2 rounded-full hover:bg-gray-100 text-gray-500 text-xl">✕</button>
        </div>
        <div className="p-4 space-y-4 flex-1">

        <label className="block">
          {preview ? (
            <span className="relative block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="מדבקה" className="w-full max-h-64 object-contain rounded-xl border border-gray-200 bg-gray-50" />
              <span className="absolute bottom-2 left-2 h-10 px-3 rounded-full bg-white/95 border border-gray-300 text-sm font-semibold flex items-center shadow-sm">📷 לצלם שוב</span>
            </span>
          ) : (
            <div className="w-full h-36 rounded-xl border-2 border-dashed border-red-300 bg-red-50 flex flex-col items-center justify-center text-red-700 font-bold">
              <span className="text-3xl">📷</span>
              צלמו את המדבקה (חובה)
            </div>
          )}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0] ?? null)} />
        </label>
        {reading === 'reading' && <p className="text-sm text-blue-700 font-semibold">🔍 קורא את המדבקה…</p>}
        {reading === 'done' && <p className="text-sm text-green-700 font-semibold">✨ מולא אוטומטית מהמדבקה — בדקו והשלימו מה שחסר</p>}
        {reading === 'empty' && <p className="text-sm text-amber-700 font-semibold">📷 לא הצלחנו לקרוא את המדבקה — נסו לצלם שוב מקרוב ובאור טוב, או מלאו ידנית</p>}
        {reading === 'off' && <p className="text-sm text-gray-600">הקריאה האוטומטית של מדבקות עוד לא מחוברת — ממלאים ידנית</p>}
        {reading === 'failed' && (
          <p className="text-sm text-amber-700 font-semibold">
            ⚠️ הקריאה מהמדבקה לא הצליחה הפעם{failDetail ? ` (${failDetail})` : ''}.{' '}
            {photo && (
              <button type="button" onClick={() => void readFromSticker(photo)} className="underline">לנסות שוב</button>
            )}{' '}
            או למלא ידנית.
          </p>
        )}

        <div>
          {label('מספר רכב', 'plate')}
          <div className="flex gap-2 items-center">
            <input
              value={plate}
              onChange={(e) => {
                setPlate(e.target.value);
                edited('plate');
              }}
              disabled={general}
              inputMode="numeric"
              placeholder="מהמדבקה (אם יש)"
              className="flex-1 h-12 px-3 rounded-xl border border-gray-300 text-base disabled:bg-gray-100"
              dir="ltr"
            />
            <button type="button" onClick={() => setGeneral((v) => !v)} className={chip(general)}>
              כללי (בלי רכב)
            </button>
          </div>
        </div>

        <div>
          {label('ספק', 'supplier', missing.supplier)}
          <div className={`flex flex-wrap gap-2 ${missing.supplier ? 'rounded-xl ring-2 ring-red-200 p-1' : ''}`}>
            {PART_RETURN_SUPPLIERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSupplier(s);
                  edited('supplier');
                }}
                className={chip(supplier === s)}
              >
                {s}
              </button>
            ))}
          </div>
          {supplier === 'אחר' && (
            <input value={supplierOther} onChange={(e) => setSupplierOther(e.target.value)} placeholder="שם הספק" className="mt-2 w-full h-10 px-3 rounded-lg border border-gray-300 text-sm" />
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <label className="block min-w-0">
            {label('מק"ט', 'sku', missing.item)}
            <input
              value={sku}
              onChange={(e) => {
                setSku(e.target.value);
                edited('sku');
              }}
              className={box(missing.item)}
              dir="ltr"
            />
          </label>
          <div>
            {label('כמות')}
            <div className="flex items-center gap-1">
              <button type="button" aria-label="פחות" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="w-11 h-12 rounded-xl border border-gray-300 text-lg">−</button>
              <span className="w-8 text-center font-bold text-lg">{quantity}</span>
              <button type="button" aria-label="עוד" onClick={() => setQuantity((q) => q + 1)} className="w-11 h-12 rounded-xl border border-gray-300 text-lg">+</button>
            </div>
          </div>
        </div>
        <label className="block">
          {label('תיאור החלק', 'description', missing.item)}
          <input
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              edited('description');
            }}
            className={box(missing.item)}
          />
          {missing.item && <span className="block text-xs text-red-700 mt-1">צריך מק&quot;ט או תיאור (אחד מהם מספיק)</span>}
        </label>
        <label className="block">
          {label('תאריך על המדבקה', 'date')}
          <input
            type="date"
            value={stickerDate}
            onChange={(e) => {
              setStickerDate(e.target.value);
              edited('date');
            }}
            className={box(false)}
          />
        </label>

        <div>
          {label('סיבת החזרה', undefined, missing.reason)}
          <div className={`flex flex-wrap gap-2 ${missing.reason ? 'rounded-xl ring-2 ring-red-200 p-1' : ''}`}>
            {PART_RETURN_REASONS.map((s) => (
              <button key={s} type="button" onClick={() => setReason(s)} className={chip(reason === s)}>
                {s}
              </button>
            ))}
          </div>
          {reason === 'אחר' && (
            <input value={reasonOther} onChange={(e) => setReasonOther(e.target.value)} placeholder="מה הסיבה?" className="mt-2 w-full h-10 px-3 rounded-lg border border-gray-300 text-sm" />
          )}
        </div>

        <div className="space-y-2">
          {label('מספר חשבונית / תעודת משלוח', 'doc')}
          <input
            value={doc}
            onChange={(e) => {
              setDoc(e.target.value);
              edited('doc');
            }}
            className={box(false)}
            dir="auto"
          />
          <p className="text-xs text-gray-500">החשבונית עצמה מצולמת בלשונית &quot;חשבוניות / ת. משלוח&quot;</p>
        </div>

        {branches.length > 1 && (
          <div>
            {label('סניף', undefined, missing.branch)}
            <p className="text-xs text-gray-500 -mt-1 mb-1.5">אם הרכב בתיק פתוח, הסניף נלקח מהתיק</p>
            <div className={`flex gap-2 ${missing.branch ? 'rounded-xl ring-2 ring-red-200 p-1' : ''}`}>
              {branches.map((b) => (
                <button key={b.id} type="button" onClick={() => setBranchId(b.id)} className={chip(branchId === b.id)}>
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {err && <p className="text-sm text-red-700 font-semibold">⚠️ {err}</p>}
        {dups && (
          <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 space-y-2 text-sm">
            <p className="font-bold text-amber-900">⚠️ החלק הזה (מק״ט {sku}) כבר מסומן להחזרה ועוד לא זוכה:</p>
            <ul className="space-y-0.5 text-amber-900">
              {dups.map((d, i) => (
                <li key={i}>
                  {formatDate(d.created_at)} · {PART_RETURN_STATUS_LABEL[d.status] ?? d.status}
                  {d.plate ? ` · רכב ${d.plate}` : ''} · כמות {d.quantity}
                  {d.branch_name ? ` · ${d.branch_name}` : ''}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => void save(true)} className="h-9 px-4 rounded-lg bg-amber-600 text-white font-bold disabled:opacity-50">זה חלק נוסף — לשמור בכל זאת</button>
              <button type="button" onClick={() => setDups(null)} className="h-9 px-4 rounded-lg border border-gray-300 bg-white">ביטול</button>
            </div>
          </div>
        )}
        </div>
        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:rounded-b-2xl">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="w-full h-14 rounded-2xl bg-brand-red hover:bg-brand-red-dark text-white text-lg font-bold disabled:opacity-50"
          >
            {busy ? 'שומר…' : 'שמירת ההחזרה'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The supplier's original invoice and the credit invoice: view the photo, or
 *  photograph it as soon as the paper arrives (Amit, 2026-10-12). */
function InvoiceButtons({ r, canCredit, onDone }: { r: PartReturnRow; canCredit: boolean; onDone: (m: string) => void }) {
  const [busy, setBusy] = useState<'original' | 'credit' | null>(null);
  const [view, setView] = useState<string | null>(null);

  async function upload(kind: 'original' | 'credit', f: File | null) {
    if (!f) return;
    const number = kind === 'original' && !r.document_number ? window.prompt('מספר החשבונית (לא חובה):') ?? '' : '';
    setBusy(kind);
    const fd = new FormData();
    fd.append('id', r.id);
    fd.append('kind', kind);
    fd.append('number', number);
    fd.append('photo', await shrinkImage(f));
    const res = await attachInvoicePhoto(fd).catch(() => ({ error: 'שגיאה' }));
    setBusy(null);
    if ('error' in res && res.error) alert(res.error);
    else onDone(kind === 'credit' ? 'חשבונית הזיכוי נשמרה ✓' : 'החשבונית נשמרה ✓');
  }

  const btn = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer';
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5" onClick={(e) => e.stopPropagation()}>
      {/* The original invoice is photographed in the "חשבוניות / ת. משלוח" tab
          (Amit, 14/10) — here only the link to it (CreditsInvoice). */}
      <CreditsInvoice r={r} />
      {r.credit_invoice_url ? (
        <button type="button" onClick={() => setView(r.credit_invoice_url)} className={`${btn} border-green-200 bg-green-50 text-green-800`}>
          📄 חשבונית זיכוי{r.credit_invoice_number ? ` ${r.credit_invoice_number}` : ''}
        </button>
      ) : (
        canCredit &&
        r.status === 'CREDITED' && (
          <label className={`${btn} border-gray-300 bg-white text-gray-700`}>
            {busy === 'credit' ? 'שומר…' : '📷 צלם חשבונית זיכוי'}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void upload('credit', e.target.files?.[0] ?? null)} />
          </label>
        )
      )}
      {view && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setView(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view} alt="חשבונית" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

const STATUS_CHIP: Record<string, string> = {
  WAITING_PICKUP: 'bg-amber-100 text-amber-800',
  COLLECTED: 'bg-blue-100 text-blue-800',
  DISPUTE: 'bg-red-100 text-red-800',
  CREDITED: 'bg-green-100 text-green-800',
};

/** Everything in one table — the view Amit knows from his Sheets: what is
 *  waiting, what went with which driver, invoice and credit numbers. */
// Table filters (Amit 15/10: "שיהיה אפשרות למיין גם לפי סטטוס ושיהיה רשום סכום").
const TABLE_STATUSES: [string, string][] = [
  ['', 'הכל'],
  ['WAITING_PICKUP', 'ממתין לאיסוף'],
  ['COLLECTED', 'נאסף · ממתין לזיכוי'],
  ['DISPUTE', 'בבירור'],
  ['CREDITED', 'זוכה'],
];
type TableSort = 'new' | 'old' | 'waiting' | 'amount';
const TABLE_SORTS: [TableSort, string][] = [
  ['new', 'חדש → ישן'],
  ['old', 'ישן → חדש'],
  ['waiting', 'הכי הרבה ימים ממתין'],
  ['amount', 'סכום זיכוי'],
];
// Days a part has been waiting at its current step (pickup → since marked; credit → since collected).
const waitingDays = (r: PartReturnRow) => (r.status === 'WAITING_PICKUP' ? daysSince(r.created_at) : (r.status === 'COLLECTED' || r.status === 'DISPUTE') && r.collected_at ? daysSince(r.collected_at) : 0);

function ReturnsTable({ rows: input, onDone, canCredit }: { rows: PartReturnRow[]; onDone: (m: string) => void; canCredit: boolean }) {
  const [view, setView] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<TableSort>('new');
  if (input.length === 0) return <p className="text-gray-400 py-8 text-center">לא נמצאו החזרות</p>;
  const rows = input
    .filter((r) => !status || r.status === status)
    .slice()
    .sort((a, b) =>
      sort === 'old'
        ? a.created_at.localeCompare(b.created_at)
        : sort === 'waiting'
          ? waitingDays(b) - waitingDays(a)
          : sort === 'amount'
            ? (b.credit_amount ?? -1) - (a.credit_amount ?? -1)
            : b.created_at.localeCompare(a.created_at),
    );
  const creditSum = rows.reduce((s, r) => s + (r.credit_amount ?? 0), 0);
  const filters = (
    <div className="flex items-center gap-1.5 flex-wrap">
      {TABLE_STATUSES.map(([k, l]) => {
        const n = k ? input.filter((r) => r.status === k).length : input.length;
        return (
          <button key={k || 'all'} type="button" onClick={() => setStatus(k)} className={`h-8 px-3 rounded-lg border text-xs font-semibold ${status === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-300 text-gray-700'}`}>
            {l} ({n})
          </button>
        );
      })}
      <select value={sort} onChange={(e) => setSort(e.target.value as TableSort)} className="h-8 px-2 rounded-lg border border-gray-300 text-xs mr-auto" aria-label="מיון">
        {TABLE_SORTS.map(([k, l]) => (
          <option key={k} value={k}>מיון: {l}</option>
        ))}
      </select>
    </div>
  );
  if (rows.length === 0)
    return (
      <div className="space-y-2">
        {filters}
        <EmptyState title="אין החזרות בסטטוס הזה" hint="בחרו סטטוס אחר בסינון למעלה" />
      </div>
    );
  const pic = (url: string | null, label: string) =>
    url ? (
      <button type="button" onClick={() => setView(url)} className="text-blue-700 underline decoration-dotted">
        {label}
      </button>
    ) : (
      <span>{label}</span>
    );
  return (
    <div className="space-y-2">
    {filters}
    <div className="overflow-auto max-h-[70vh] rounded-xl border border-gray-200 bg-white">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="bg-gray-100 text-gray-700 text-xs sticky top-0 z-10 shadow-sm">
          <tr>
            {['תאריך', 'חלק', 'מק"ט', 'ספק', 'רכב', 'חשבונית מקור', 'סטטוס', 'נמסר לנהג', 'חשבונית זיכוי', 'סכום זיכוי', ''].map((h, i) => (
              <th key={h || i} className="px-3 py-2 text-right font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id} className="align-top even:bg-gray-50/60 hover:bg-indigo-50/40">
              <td className="px-3 py-2 whitespace-nowrap text-gray-500">{formatDate(r.created_at)}</td>
              <td className="px-3 py-2">
                {pic(r.photo_url, r.description || '—')}
                {r.quantity > 1 && <span className="text-gray-500"> ×{r.quantity}</span>}
                <div className="text-[11px] text-gray-400">{r.reason_label}</div>
              </td>
              <td className="px-3 py-2 whitespace-nowrap" dir="ltr">{r.sku ?? '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{r.supplier_label}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {r.case_id ? (
                  <Link href={`/go/${r.case_id}`} className="text-indigo-700 font-semibold">{r.plate}</Link>
                ) : (
                  r.plate ?? 'כללי'
                )}
                {r.branch_name && <div className="text-[11px] text-gray-400">{r.branch_name}</div>}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{r.document_number ? <CreditsInvoice r={r} compact /> : '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_CHIP[r.status] ?? 'bg-gray-100 text-gray-700'}`}>
                  {PART_RETURN_STATUS_LABEL[r.status] ?? r.status}
                </span>
                {waitingDays(r) > 0 && (
                  <div className={`text-[11px] ${waitingDays(r) > 14 ? 'text-red-600 font-bold' : waitingDays(r) > 7 ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>{waitingDays(r)} ימים ממתין</div>
                )}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {r.collected_at ? (
                  <>
                    {r.driver_name}
                    <div className="text-[11px] text-gray-400">{formatDate(r.collected_at)}</div>
                    {r.driver_signature_url && <SignatureThumb url={r.driver_signature_url} />}
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{pic(r.credit_invoice_url, r.credit_invoice_number || (r.credit_invoice_url ? '📄 תמונה' : '—'))}</td>
              <td className="px-3 py-2 whitespace-nowrap">{r.credit_amount != null ? `₪${r.credit_amount.toLocaleString('he-IL')}` : '—'}</td>
              <td className="px-3 py-2">
                <InvoiceButtons r={r} canCredit={canCredit} onDone={onDone} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-100 text-xs font-semibold text-gray-700 sticky bottom-0">
          <tr>
            <td colSpan={9} className="px-3 py-2">{rows.length} שורות</td>
            <td className="px-3 py-2 whitespace-nowrap">{creditSum ? ils(creditSum) : '—'}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      {view && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setView(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view} alt="" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
    </div>
  );
}

/** The driver's signature from the hand-over — tap to enlarge. */
function SignatureThumb({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} className="mt-1 block" title="חתימת הנהג">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="חתימת הנהג" className="h-10 w-auto rounded border border-gray-200 bg-white" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="חתימת הנהג" className="max-w-full max-h-full rounded-lg bg-white" />
        </div>
      )}
    </>
  );
}

/** Label / value rows, one per line (Amit, 2026-10-14). */
function Fields({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <dl className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs ${className}`}>{children}</dl>;
}

function Field({ label, children, strong = false, tone }: { label: string; children: React.ReactNode; strong?: boolean; tone?: string }) {
  return (
    <>
      <dt className="text-gray-400 whitespace-nowrap">{label}:</dt>
      <dd className={`min-w-0 break-words ${tone ?? (strong ? 'text-gray-900 font-bold text-sm' : 'text-gray-800')}`}>{children}</dd>
    </>
  );
}
