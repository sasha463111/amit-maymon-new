'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCollectionCase, type CaseInput, type CollectionCase, type CollectionStatus } from '@/app/actions/collections';
import { payerOf, THIRD_PARTY } from '@/lib/collections';
import { CLAIM_TYPES, INSURERS, WORK_SOURCE_LABEL } from '@/lib/finance';

// Shared by the cases list and the case file (2026-10-14).

export const STATUS_LABEL: Record<CollectionStatus, string> = {
  OPEN: 'בטיפול',
  PAID: 'שולם',
  PARTIAL: 'תשלום חלקי',
  DISPUTE: 'במחלוקת',
  LEGAL: 'מחלקה משפטית',
  BLOCKED: 'חסומה',
};
export const STATUS_CHIP: Record<CollectionStatus, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  PAID: 'bg-green-100 text-green-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  DISPUTE: 'bg-red-100 text-red-800',
  LEGAL: 'bg-purple-100 text-purple-800',
  BLOCKED: 'bg-gray-800 text-white',
};

export const ils = (n: number | null | undefined) => (n == null ? '' : `₪${Math.round(n).toLocaleString('he-IL')}`);
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
export const num = (s: string): number | null => {
  const v = s.replace(/[,₪\s]/g, '');
  return v === '' ? null : Number(v);
};
export const str = (n: number | null | undefined) => (n == null ? '' : String(n));

/** To collect: the invoice, minus VAT offset and reinstatement when present. */
export const toCollect = (c: CollectionCase) => (c.amount_due ?? 0) - (c.vat_offset ?? 0) - (c.reinstatement ?? 0) - (c.offset_amount ?? 0);
export const isClosed = (c: CollectionCase) => !!c.closed_at;

/** Case data fields — shared by "פתיחת תיק" and the editor. */
export function CaseFields({ v, set }: { v: CaseInput; set: (p: Partial<CaseInput>) => void }) {
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

/** Status, payment, offset and legal department — inside the case file. */
export function StatusEditor({ c, onClose }: { c: CollectionCase; onClose: () => void }) {
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

  const due = (data.amount_due ?? 0) - (data.vat_offset ?? 0) - (data.reinstatement ?? 0) - (num(offset) ?? 0);

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
      partial_reason: reason || null,
      offset_amount: num(offset),
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
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-3">
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
          </div>
        )}

        {/* Offset (קיזוז) — any time, not only at payment; required for a partial payment. */}
        <div className="flex flex-wrap items-end gap-3">
          <label className={lab}>
            סכום קיזוז {status === 'PARTIAL' ? '*' : '(אם יש)'}
            <input value={offset} onChange={(e) => setOffset(e.target.value)} inputMode="decimal" className={`${input} block w-32`} dir="ltr" />
          </label>
          <label className={`${lab} flex-1 min-w-[220px]`}>
            סיבת הקיזוז {status === 'PARTIAL' ? '*' : ''}
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={`${input} block w-full`} />
          </label>
        </div>

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
    </div>
  );
}

