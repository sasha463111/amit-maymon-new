'use client';

import { useMemo, useState } from 'react';
import { createSupplierDoc, readSupplierDocPhoto, verifySupplierDoc, type SupplierDocDuplicate, type SupplierDocRow } from '@/app/actions/supplierDocs';
import type { PartReturnRow } from '@/app/actions/partReturns';
import { PART_RETURN_SUPPLIERS } from '@/lib/partReturns';
import { shrinkImage } from '@/lib/shrinkImage';
import { formatDate } from '@/lib/dates';

// "🧾 חשבוניות / ת. משלוח" (Amit, 2026-10-14): every photographed supplier
// document, by branch and date, with search. Invoices photographed on a
// return (original / credit) are listed here too.

export const DOC_TYPE_LABEL: Record<string, string> = {
  INVOICE: 'חשבונית',
  DELIVERY_NOTE: 'תעודת משלוח',
  CREDIT_INVOICE: 'חשבונית זיכוי',
};

/** One line of the archive — an archive document or an invoice on a return. */
export type DocLine = {
  key: string;
  branch_id: string;
  branch_name: string | null;
  type: string;
  supplier: string;
  number: string | null;
  date: string;
  plate: string | null;
  amount: number | null;
  notes: string | null;
  photo_url: string | null;
  by: string | null;
  source: 'archive' | 'return';
  doc?: SupplierDocRow;
};

export function docLines(docs: SupplierDocRow[], returns: PartReturnRow[]): DocLine[] {
  const lines: DocLine[] = docs.map((d) => ({
    key: d.id,
    branch_id: d.branch_id,
    branch_name: d.branch_name,
    type: DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type,
    supplier: d.supplier,
    number: d.doc_number,
    date: d.doc_date,
    plate: d.plate,
    amount: d.amount,
    notes: d.notes,
    photo_url: d.photo_url,
    by: d.created_by_name,
    source: 'archive',
    doc: d,
  }));
  for (const r of returns) {
    const part = [r.description, r.sku].filter(Boolean).join(' · ');
    if (r.invoice_url)
      lines.push({
        key: `${r.id}-o`, branch_id: r.branch_id, branch_name: r.branch_name, type: 'חשבונית (מהחזרה)', supplier: r.supplier_label,
        number: r.document_number, date: r.created_at.slice(0, 10), plate: r.plate, amount: null, notes: part || null,
        photo_url: r.invoice_url, by: r.created_by_name, source: 'return',
      });
    if (r.credit_invoice_url)
      lines.push({
        key: `${r.id}-c`, branch_id: r.branch_id, branch_name: r.branch_name, type: 'חשבונית זיכוי (מהחזרה)', supplier: r.supplier_label,
        number: r.credit_invoice_number, date: (r.credited_at ?? r.created_at).slice(0, 10), plate: r.plate, amount: r.credit_amount,
        notes: part || null, photo_url: r.credit_invoice_url, by: null, source: 'return',
      });
  }
  return lines.sort((a, b) => b.date.localeCompare(a.date));
}

export function matchesDoc(l: DocLine, q: string): boolean {
  return [l.number, l.supplier, l.plate, l.notes, l.type, l.by, l.branch_name, formatDate(l.date)].some((v) => (v ?? '').toLowerCase().includes(q));
}

export function SupplierDocsTab({
  lines,
  branches,
  onDone,
}: {
  lines: DocLine[];
  branches: { id: string; name: string }[];
  onDone: (m: string) => void;
}) {
  const [branch, setBranch] = useState<string>('');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => lines.filter((l) => (!branch || l.branch_id === branch) && (!q || matchesDoc(l, q))), [lines, branch, q]);
  const branchIds = Array.from(new Set(shown.map((l) => l.branch_id)));

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="px-4 h-11 bg-gray-900 text-white rounded-xl text-sm font-bold"
        >
          📷 צלם חשבונית / ת. משלוח
        </button>
        {branches.length > 1 && (
          <select value={branch} onChange={(e) => setBranch(e.target.value)} className="h-11 px-3 rounded-xl border border-gray-300 text-sm">
            <option value="">כל הסניפים</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔎 מספר מסמך, ספק, רכב, תאריך…"
          className="flex-1 min-w-[200px] h-11 px-3 rounded-xl border border-gray-300 text-sm"
          dir="auto"
        />
      </div>

      {shown.length === 0 && <p className="text-gray-400 py-8 text-center">{lines.length ? 'לא נמצאו מסמכים' : 'עוד לא צולמו מסמכים'}</p>}

      {branchIds.map((bid) => {
        const group = shown.filter((l) => l.branch_id === bid);
        return (
          <section key={bid} className="space-y-1">
            <h3 className="text-sm font-bold text-gray-700">
              {group[0]?.branch_name ?? '—'} <span className="text-gray-400 font-normal">({group.length})</span>
            </h3>
            <DocsTable rows={group} onDone={onDone} />
          </section>
        );
      })}

      {adding && (
        <NewDocForm
          branches={branches}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            onDone('המסמך נשמר ✓');
          }}
        />
      )}
    </div>
  );
}

export function DocsTable({ rows, onDone }: { rows: DocLine[]; onDone: (m: string) => void }) {
  const [view, setView] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function verify(id: string) {
    setBusy(id);
    const r = await verifySupplierDoc(id);
    setBusy(null);
    onDone(r.error ? `⚠️ ${r.error}` : 'סומן כנבדק ✓');
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-[760px] w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-xs">
          <tr>
            {['תאריך', 'סוג', 'ספק', 'מספר', 'רכב', 'סכום', 'הערות', 'צילם', 'בדיקה', ''].map((h) => (
              <th key={h} className="px-3 py-2 text-right font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.key} className="border-t border-gray-100">
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(l.date)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{l.type}</td>
              <td className="px-3 py-2 whitespace-nowrap">{l.supplier}</td>
              <td className="px-3 py-2 whitespace-nowrap" dir="ltr">{l.number ?? '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{l.plate ?? ''}</td>
              <td className="px-3 py-2 whitespace-nowrap">{l.amount != null ? `₪${l.amount.toLocaleString('he-IL')}` : ''}</td>
              <td className="px-3 py-2 max-w-[220px] truncate" title={l.notes ?? ''}>{l.notes ?? ''}</td>
              <td className="px-3 py-2 whitespace-nowrap text-gray-500">{l.by ?? ''}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {l.source === 'return' ? (
                  <span className="text-gray-400 text-xs">בהחזרה</span>
                ) : l.doc?.verified_at ? (
                  <span className="text-green-700 text-xs font-semibold" title={formatDate(l.doc.verified_at)}>✓ {l.doc.verified_by_name ?? 'נבדק'}</span>
                ) : l.doc?.mine ? (
                  <span className="text-amber-700 text-xs">ממתין לבדיקה</span>
                ) : (
                  <button
                    type="button"
                    disabled={busy === l.key}
                    onClick={() => void verify(l.key)}
                    className="px-2 h-8 rounded-lg border border-green-300 bg-green-50 text-green-800 text-xs font-semibold disabled:opacity-50"
                  >
                    ✓ נבדק
                  </button>
                )}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {l.photo_url && (
                  <button type="button" onClick={() => setView(l.photo_url)} className="text-blue-700 underline decoration-dotted">
                    📄 צפייה
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {view && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setView(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view} alt="מסמך" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

function NewDocForm({ branches, onClose, onSaved }: { branches: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const [docType, setDocType] = useState('INVOICE');
  const [supplier, setSupplier] = useState('');
  const [supplierOther, setSupplierOther] = useState('');
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(today);
  const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0].id : '');
  const [plate, setPlate] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reading the photo (Amit, 2026-10-14): fills only fields still empty —
  // whatever the employee already typed stays.
  const [reading, setReading] = useState<'idle' | 'reading' | 'filled' | 'manual'>('idle');
  const [dateTouched, setDateTouched] = useState(false);

  async function readPhoto(f: File) {
    setReading('reading');
    const fd = new FormData();
    fd.append('photo', await shrinkImage(f));
    const r = await readSupplierDocPhoto(fd).catch(() => ({ unavailable: true as const }));
    const x = 'fields' in r ? r.fields : undefined;
    if (!x) return setReading('manual');
    if (x.doc_type) setDocType(x.doc_type);
    if (x.supplier) setSupplier((v) => v || x.supplier!);
    if (x.supplier === 'אחר' && x.supplier_other) setSupplierOther((v) => v || x.supplier_other!);
    if (x.invoice_number) setNumber((v) => v || x.invoice_number!);
    if (x.plate) setPlate((v) => v || x.plate!);
    if (x.amount != null) setAmount((v) => v || String(x.amount));
    if (x.invoice_date && !dateTouched) setDate(x.invoice_date);
    setReading('filled');
  }

  const [duplicates, setDuplicates] = useState<SupplierDocDuplicate[] | null>(null);

  async function save(confirmDuplicate = false) {
    setError(null);
    if (!photo) return setError('נא לצלם את המסמך');
    if (!supplier || (supplier === 'אחר' && !supplierOther.trim())) return setError('נא לבחור ספק');
    if (!branchId) return setError('נא לבחור סניף');
    setSaving(true);
    const fd = new FormData();
    fd.append('doc_type', docType);
    fd.append('supplier', supplier === 'אחר' ? supplierOther.trim() : supplier);
    fd.append('doc_number', number);
    fd.append('doc_date', date);
    fd.append('branch_id', branchId);
    fd.append('plate', plate);
    fd.append('amount', amount);
    fd.append('notes', notes);
    fd.append('photo', await shrinkImage(photo));
    if (confirmDuplicate) fd.append('confirm_duplicate', 'yes');
    const r = await createSupplierDoc(fd);
    setSaving(false);
    if (r.duplicates?.length) return setDuplicates(r.duplicates);
    setDuplicates(null);
    if (r.error) setError(r.error);
    else onSaved();
  }

  const input = 'w-full h-11 px-3 rounded-lg border border-gray-300 text-sm';
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-2" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-4 space-y-3 max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">🧾 חשבונית / תעודת משלוח</h2>
          <button type="button" onClick={onClose} className="text-gray-400 text-xl" aria-label="סגור">✕</button>
        </div>

        <label className="block w-full h-36 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center cursor-pointer overflow-hidden">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="max-h-full object-contain" />
          ) : (
            <span className="text-gray-600 font-bold">📷 צלם את המסמך</span>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setPhoto(f);
              setPreview(f ? URL.createObjectURL(f) : null);
              if (f) void readPhoto(f);
            }}
          />
        </label>
        {reading === 'reading' && <p className="text-sm text-indigo-700">🔍 קורא את המסמך…</p>}
        {reading === 'filled' && <p className="text-sm text-green-700">✨ מולא אוטומטית — בדקו את הפרטים והשלימו מה שחסר</p>}
        {reading === 'manual' && <p className="text-sm text-gray-500">ממלאים את הפרטים ידנית</p>}

        <div className="flex gap-2">
          {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => setDocType(k)}
              className={`flex-1 h-10 rounded-lg border text-sm ${docType === k ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300'}`}
            >
              {v}
            </button>
          ))}
        </div>

        <label className="block text-xs text-gray-500">ספק</label>
        <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={input}>
          <option value="">בחרו ספק…</option>
          {PART_RETURN_SUPPLIERS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {supplier === 'אחר' && <input value={supplierOther} onChange={(e) => setSupplierOther(e.target.value)} placeholder="שם הספק" className={input} />}

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-500">
            {docType === 'DELIVERY_NOTE' ? 'מספר תעודת משלוח' : docType === 'CREDIT_INVOICE' ? 'מספר חשבונית זיכוי' : 'מספר חשבונית'}
            <input value={number} onChange={(e) => setNumber(e.target.value)} className={`${input} mt-0.5`} dir="ltr" />
          </label>
          <label className="text-xs text-gray-500">
            {docType === 'DELIVERY_NOTE' ? 'תאריך התעודה' : 'תאריך החשבונית'}
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setDateTouched(true); }} className={`${input} mt-0.5`} />
          </label>
          <label className="text-xs text-gray-500">
            מספר רכב (אם מופיע)
            <input value={plate} onChange={(e) => setPlate(e.target.value)} inputMode="numeric" className={`${input} mt-0.5`} dir="ltr" />
          </label>
          <label className="text-xs text-gray-500">
            סכום כולל מע״מ ₪
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={`${input} mt-0.5`} dir="ltr" />
          </label>
        </div>
        {branches.length > 1 && (
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={input}>
            <option value="">סניף…</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        <label className="block text-xs text-gray-500">
          הערות (רשות)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={`${input} mt-0.5`} />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {duplicates && (
          <div className="p-3 rounded-xl border-2 border-amber-300 bg-amber-50 space-y-2">
            <p className="font-bold text-amber-900">⚠️ שים/י לב — ייתכן שזו הקלדה כפולה</p>
            <ul className="text-sm text-amber-900">
              {duplicates.map((d, i) => (
                <li key={i}>
                  {DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type} {d.doc_number} של {d.supplier} כבר צולמה · {formatDate(d.doc_date)}
                  {d.branch_name ? ` · ${d.branch_name}` : ''}
                </li>
              ))}
            </ul>
            <p className="text-sm text-amber-900">זה מסמך אחר עם אותו מספר, או אותו מסמך פעמיים?</p>
            <div className="flex gap-2 flex-wrap">
              <button type="button" disabled={saving} onClick={() => void save(true)} className="h-10 px-3 rounded-lg bg-amber-600 text-white text-sm font-semibold disabled:opacity-50">
                מסמך אחר — אני מאשר/ת, שמור
              </button>
              <button type="button" onClick={() => setDuplicates(null)} className="h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm">
                אותו מסמך — בטל
              </button>
            </div>
          </div>
        )}
        <button type="button" onClick={() => void save()} disabled={saving} className="w-full h-12 rounded-xl bg-red-600 text-white text-base font-bold disabled:opacity-50">
          {saving ? 'שומר…' : 'שמור'}
        </button>
      </div>
    </div>
  );
}
