'use client';

import { useMemo, useState } from 'react';
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
import { formatDate, formatDateTime } from '@/lib/dates';
import type { SupplierDocRow } from '@/app/actions/supplierDocs';
import { DocsTable, SupplierDocsTab, docLines, matchesDoc } from './SupplierDocsTab';

type Tab = 'pickup' | 'credit' | 'done' | 'all' | 'docs';

const HANDOVER_ROLES = new Set(['CEO', 'SERVICE_ADVISOR', 'SERVICE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_MANAGER']);
const CREDIT_ROLES = new Set(['CEO', 'WAREHOUSE_MANAGER']);

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function ReturnsClient({
  rows,
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
  const [toast, setToast] = useState<string | null>(null);
  const canHandOver = HANDOVER_ROLES.has(role);
  const canCredit = CREDIT_ROLES.has(role);

  const waiting = rows.filter((r) => r.status === 'WAITING_PICKUP');
  const forCredit = rows.filter((r) => r.status === 'COLLECTED' || r.status === 'DISPUTE');
  const done = rows.filter((r) => r.status === 'CREDITED');
  // Search over everything (Amit: a part or a credit shows up a month or two
  // later — "was this returned or not?"): part, SKU, invoice numbers, plate…
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const found = useMemo(
    () =>
      q
        ? rows.filter((r) =>
            [r.description, r.sku, r.plate, r.customer_name, r.supplier_label, r.document_number, r.credit_invoice_number, r.driver_name, r.reason_label, r.notes]
              .some((v) => (v ?? '').toLowerCase().includes(q)),
          )
        : rows,
    [rows, q],
  );
  const canDocs = docs !== null;
  const lines = useMemo(() => (canDocs ? docLines(docs ?? [], rows) : []), [canDocs, docs, rows]);
  const foundDocs = useMemo(() => (q ? lines.filter((l) => matchesDoc(l, q)) : []), [lines, q]);

  function done_(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
    router.refresh();
  }

  return (
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

      {toast && <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 px-4 py-2 text-sm font-semibold">{toast}</div>}
      {error && <p className="text-sm text-red-600">⚠️ {error}</p>}

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

      {q ? (
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
        {([
          ['pickup', `ממתין לאיסוף (${waiting.length})`],
          ['credit', `ממתין לזיכוי (${forCredit.length})`],
          ['done', `זוכה (${done.length})`],
          ['all', `📋 טבלה (${rows.length})`],
          ...(canDocs ? [['docs', `🧾 חשבוניות / ת. משלוח (${lines.length})`] as [Tab, string]] : []),
        ] as [Tab, string][]).map(([k, label]) => (
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

      {tab === 'pickup' && <PickupTab rows={waiting} canHandOver={canHandOver} onDone={done_} />}
      {tab === 'credit' && <CreditTab rows={forCredit} canCredit={canCredit} onDone={done_} />}
      {tab === 'done' && (
        <div className="grid gap-3 md:grid-cols-2">
          {done.length === 0 && <p className="text-gray-400 py-8 text-center md:col-span-2">אין עדיין זיכויים</p>}
          {done.map((r) => (
            <PartCard key={r.id} r={r}>
              <p className="text-xs text-green-700 font-semibold mt-1">
                ✓ זוכה {r.credited_at ? formatDate(r.credited_at) : ''} · חשבונית זיכוי {r.credit_invoice_number}
                {r.credit_amount != null ? ` · ₪${r.credit_amount.toLocaleString('he-IL')}` : ''}
              </p>
              <InvoiceButtons r={r} canCredit={canCredit} onDone={done_} />
            </PartCard>
          ))}
        </div>
      )}
      {tab === 'all' && <ReturnsTable rows={rows} onDone={done_} canCredit={canCredit} />}
      {tab === 'docs' && canDocs && <SupplierDocsTab lines={lines} branches={branches} onDone={done_} />}
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
        <p className="font-bold text-gray-900 text-sm truncate">{r.description || r.sku || '—'}</p>
        <p className="text-xs text-gray-600 truncate" dir="auto">
          {r.sku ? <span dir="ltr">{r.sku}</span> : null}
          {r.quantity > 1 ? ` · כמות ${r.quantity}` : ''}
          {' · '}
          {r.reason_label}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {r.case_id ? (
            <Link href={`/go/${r.case_id}`} onClick={(e) => e.stopPropagation()} className="text-indigo-700 font-semibold">
              🚗 {r.plate}{r.customer_name ? ` · ${r.customer_name}` : ''}
            </Link>
          ) : r.plate ? (
            `🚗 ${r.plate} (ללא תיק)`
          ) : (
            'כללי (ללא רכב)'
          )}
          {r.branch_name ? ` · ${r.branch_name}` : ''}
        </p>
        <p className={`text-[11px] ${late ? 'text-amber-700 font-semibold' : 'text-gray-400'}`}>
          {r.created_by_name ?? ''} · {formatDateTime(r.created_at)}
          {r.status === 'WAITING_PICKUP' ? ` · ממתין ${age} ימים` : ''}
          {r.document_number ? ` · מסמך ${r.document_number}` : ''}
        </p>
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
function PickupTab({ rows, canHandOver, onDone }: { rows: PartReturnRow[]; canHandOver: boolean; onDone: (m: string) => void }) {
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

  if (rows.length === 0) return <p className="text-gray-400 py-8 text-center">אין חלקים שממתינים לאיסוף 👍</p>;

  const shown = supplier ? groups.find(([s]) => s === supplier)?.[1] ?? [] : rows;

  function pick(s: string | null) {
    setSupplier(s);
    setSelected(new Set());
    setErr(null);
    // The driver who came last time for this supplier, so usually you only confirm.
    setDriver(s ? lastDriverFor(s) : '');
  }

  async function confirm() {
    setBusy(true);
    setErr(null);
    const res = await handOverToDriver(Array.from(selected), driver);
    setBusy(false);
    if ('error' in res && res.error) {
      setErr(res.error);
      return;
    }
    try {
      if (supplier) localStorage.setItem(`returns-driver:${supplier}`, driver.trim());
    } catch {
      /* storage unavailable — only a convenience */
    }
    setSelected(new Set());
    onDone(`נמסרו לנהג ${driver.trim()}: ${'updated' in res ? res.updated : selected.size} חלקים ✓`);
  }

  return (
    <div className="space-y-3">
      {canHandOver && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-600 self-center ml-1">נהג הגיע? בחרו ספק:</span>
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
            onClick={() => void confirm()}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold disabled:opacity-40"
          >
            {busy ? 'שומר…' : `🚚 נמסר לנהג (${selected.size})`}
          </button>
          {err && <span className="text-sm text-red-700 w-full">⚠️ {err}</span>}
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

  if (rows.length === 0) return <p className="text-gray-400 py-8 text-center">אין חלקים שממתינים לזיכוי</p>;

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
          <p className="text-xs text-gray-600 mt-1">
            🚚 נמסר ל{r.driver_name ?? '—'} · {r.collected_at ? formatDate(r.collected_at) : ''} ({r.collected_at ? daysSince(r.collected_at) : 0} ימים)
            {r.collected_by_name ? ` · ע״י ${r.collected_by_name}` : ''}
          </p>
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
  const [reading, setReading] = useState<'idle' | 'reading' | 'done'>('idle');
  const [invoice, setInvoice] = useState<File | null>(null);
  const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0].id : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    try {
      const fd = new FormData();
      fd.append('photo', await shrinkImage(f, { maxSide: 1600 }));
      const res = await readPartSticker(fd);
      const x = res.fields;
      if (!x) return setReading('idle');
      // Functional updates: the reading takes a few seconds, and anything the
      // user typed meanwhile must win over the sticker.
      let filled = false;
      const fill = (val: string | null, set: React.Dispatch<React.SetStateAction<string>>) => {
        if (!val) return;
        filled = true;
        set((cur) => (cur.trim() ? cur : val));
      };
      if (!general) fill(x.plate, setPlate);
      fill(x.supplier, setSupplier);
      if (x.supplier === 'אחר') fill(x.supplier_other, setSupplierOther);
      fill(x.sku, setSku);
      fill(x.description, setDescription);
      fill(x.document_number, setDoc);
      fill(x.sticker_date, setStickerDate);
      if (x.quantity && x.quantity > 1) {
        filled = true;
        setQuantity((q) => (q === 1 ? x.quantity! : q));
      }
      setReading(filled ? 'done' : 'idle');
    } catch {
      setReading('idle');
    }
  }

  async function save() {
    setErr(null);
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
    if (invoice) fd.append('invoice', await shrinkImage(invoice));
    fd.append('branch_id', branchId);
    const res = await createPartReturn(fd).catch((e: unknown) => ({ error: e instanceof Error ? e.message : 'שגיאה' }));
    setBusy(false);
    if ('error' in res && res.error) return setErr(res.error);
    onSaved('linkedToCase' in res ? !!res.linkedToCase : false);
  }

  const chip = (on: boolean) => `px-3 py-2 rounded-xl border-2 text-sm font-semibold ${on ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-800 border-gray-300'}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-2 sm:p-6 overflow-y-auto" dir="rtl">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">📷 חלק להחזרה</h2>
          <button type="button" onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>

        <label className="block">
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview} alt="מדבקה" className="w-full max-h-64 object-contain rounded-xl border border-gray-200" />
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

        <div>
          <p className="text-sm font-semibold mb-2">מספר רכב</p>
          <div className="flex gap-2 items-center">
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              disabled={general}
              inputMode="numeric"
              placeholder="מהמדבקה (אם יש)"
              className="flex-1 h-11 px-3 rounded-lg border border-gray-300 text-base disabled:bg-gray-100"
              dir="ltr"
            />
            <button type="button" onClick={() => setGeneral((v) => !v)} className={chip(general)}>
              כללי (בלי רכב)
            </button>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold mb-2">ספק</p>
          <div className="flex flex-wrap gap-2">
            {PART_RETURN_SUPPLIERS.map((s) => (
              <button key={s} type="button" onClick={() => setSupplier(s)} className={chip(supplier === s)}>
                {s}
              </button>
            ))}
          </div>
          {supplier === 'אחר' && (
            <input value={supplierOther} onChange={(e) => setSupplierOther(e.target.value)} placeholder="שם הספק" className="mt-2 w-full h-10 px-3 rounded-lg border border-gray-300 text-sm" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder='מק"ט' className="h-11 px-3 rounded-lg border border-gray-300 text-sm" dir="ltr" />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-600">כמות</span>
            <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="w-10 h-11 rounded-lg border border-gray-300 text-lg">−</button>
            <span className="w-8 text-center font-bold">{quantity}</span>
            <button type="button" onClick={() => setQuantity((q) => q + 1)} className="w-10 h-11 rounded-lg border border-gray-300 text-lg">+</button>
          </div>
        </div>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="תיאור החלק" className="w-full h-11 px-3 rounded-lg border border-gray-300 text-sm" />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-600 shrink-0">תאריך על המדבקה</span>
          <input type="date" value={stickerDate} onChange={(e) => setStickerDate(e.target.value)} className="flex-1 h-10 px-3 rounded-lg border border-gray-300 text-sm" />
        </label>

        <div>
          <p className="text-sm font-semibold mb-2">סיבת החזרה</p>
          <div className="flex flex-wrap gap-2">
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
          <p className="text-sm font-semibold">חשבונית מקור <span className="text-xs text-gray-400 font-normal">(אם כבר הגיעה — אפשר להוסיף גם אחר כך)</span></p>
          <div className="flex gap-2">
            <input value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="מספר חשבונית / תעודת משלוח" className="flex-1 h-11 px-3 rounded-lg border border-gray-300 text-sm" dir="auto" />
            <label className={`${chip(!!invoice)} cursor-pointer whitespace-nowrap flex items-center`}>
              📄 {invoice ? 'צולמה ✓' : 'צלם חשבונית'}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setInvoice(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </div>

        {branches.length > 1 && (
          <div>
            <p className="text-sm font-semibold mb-2">סניף <span className="text-xs text-gray-400 font-normal">(אם הרכב בתיק פתוח, נלקח מהתיק)</span></p>
            <div className="flex gap-2">
              {branches.map((b) => (
                <button key={b.id} type="button" onClick={() => setBranchId(b.id)} className={chip(branchId === b.id)}>
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {err && <p className="text-sm text-red-700 font-semibold">⚠️ {err}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="w-full h-12 rounded-xl bg-red-600 text-white text-base font-bold disabled:opacity-50"
        >
          {busy ? 'שומר…' : 'שמור החזרה'}
        </button>
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
      {r.invoice_url ? (
        <button type="button" onClick={() => setView(r.invoice_url)} className={`${btn} border-blue-200 bg-blue-50 text-blue-800`}>
          📄 חשבונית מקור{r.document_number ? ` ${r.document_number}` : ''}
        </button>
      ) : (
        <label className={`${btn} border-gray-300 bg-white text-gray-700`}>
          {busy === 'original' ? 'שומר…' : '📷 צלם חשבונית מקור'}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void upload('original', e.target.files?.[0] ?? null)} />
        </label>
      )}
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
function ReturnsTable({ rows, onDone, canCredit }: { rows: PartReturnRow[]; onDone: (m: string) => void; canCredit: boolean }) {
  const [view, setView] = useState<string | null>(null);
  if (rows.length === 0) return <p className="text-gray-400 py-8 text-center">לא נמצאו החזרות</p>;
  const pic = (url: string | null, label: string) =>
    url ? (
      <button type="button" onClick={() => setView(url)} className="text-blue-700 underline decoration-dotted">
        {label}
      </button>
    ) : (
      <span>{label}</span>
    );
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-xs">
          <tr>
            {['תאריך', 'חלק', 'מק"ט', 'ספק', 'רכב', 'חשבונית מקור', 'סטטוס', 'נמסר לנהג', 'חשבונית זיכוי', 'סכום', ''].map((h) => (
              <th key={h} className="px-3 py-2 text-right font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
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
              <td className="px-3 py-2 whitespace-nowrap">{pic(r.invoice_url, r.document_number || (r.invoice_url ? '📄 תמונה' : '—'))}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_CHIP[r.status] ?? 'bg-gray-100 text-gray-700'}`}>
                  {PART_RETURN_STATUS_LABEL[r.status] ?? r.status}
                </span>
                {r.status === 'WAITING_PICKUP' && <div className="text-[11px] text-gray-400">{daysSince(r.created_at)} ימים</div>}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {r.collected_at ? (
                  <>
                    {r.driver_name}
                    <div className="text-[11px] text-gray-400">{formatDate(r.collected_at)}</div>
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
      </table>
      {view && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setView(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view} alt="" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
