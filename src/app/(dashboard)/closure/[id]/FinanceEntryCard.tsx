'use client';

import { useState } from 'react';
import { saveFinanceEntry, type FinanceDuplicate, type FinanceEntry } from '@/app/actions/financeClosures';
import { APPRAISERS, CLAIM_TYPES, IDF_CATEGORIES, INSURERS, WORK_SOURCE_LABEL, financeDefaultsFromSubType, normalizeAppraiser, type WorkSource } from '@/lib/finance';
import { formatDate } from '@/lib/dates';

const toNum = (s: string): number | null => {
  const v = s.replace(/[,₪\s]/g, '');
  return v ? Number(v) : null;
};
const toStr = (n: number | null | undefined) => (n == null ? '' : String(n));

/** "💰 נתוני סגירה לכספים" — Ilana's Excel columns, feeding /finance (Amit, 2026-10-14). */
export function FinanceEntryCard({
  caseId,
  subType,
  insuranceCompany,
  appraiserName,
  initial,
  onSaved,
}: {
  caseId: string;
  subType: string | null;
  insuranceCompany: string | null;
  appraiserName: string | null;
  initial: (FinanceEntry & { updated_at: string }) | null;
  onSaved?: () => void;
}) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const d = financeDefaultsFromSubType(subType);
  const [closedOn, setClosedOn] = useState(initial?.closed_on ?? today);
  const [source, setSource] = useState<WorkSource>(initial?.work_source ?? d.workSource);
  const [insurer, setInsurer] = useState(initial?.insurer ?? insuranceCompany ?? '');
  const [claimType, setClaimType] = useState(initial?.claim_type ?? d.claimType);
  const [idfCategory, setIdfCategory] = useState(initial?.idf_category ?? '');
  const [appraiser, setAppraiser] = useState(initial?.appraiser ?? normalizeAppraiser(appraiserName));
  const [amount, setAmount] = useState(toStr(initial?.amount_ours));
  const [amountShir, setAmountShir] = useState(toStr(initial?.amount_shir));
  const [invoice, setInvoice] = useState(initial?.invoice_number ?? '');
  const [deductible, setDeductible] = useState(toStr(initial?.deductible));
  const [jobCard, setJobCard] = useState(initial?.job_card_no ?? '');
  const [claimCheckDue, setClaimCheckDue] = useState(initial?.claim_check_due_date ?? '');
  const [hasDeposit, setHasDeposit] = useState(!!initial?.deposit_check_due_date);
  const [depositDue, setDepositDue] = useState(initial?.deposit_check_due_date ?? '');
  const [claimCheckAmount, setClaimCheckAmount] = useState(toStr(initial?.claim_check_amount));
  const [depositAmount, setDepositAmount] = useState(toStr(initial?.deposit_check_amount));
  // "מתקזז מע״מ" / "כינון": yes/no first, the amount only when yes (Amit, 14/10).
  const [hasVat, setHasVat] = useState<boolean | null>(initial ? initial.vat_offset != null : null);
  const [vatOffset, setVatOffset] = useState(toStr(initial?.vat_offset));
  const [hasReinst, setHasReinst] = useState<boolean | null>(initial ? initial.reinstatement != null : null);
  const [reinstatement, setReinstatement] = useState(toStr(initial?.reinstatement));
  const [appraiserFee, setAppraiserFee] = useState(toStr(initial?.appraiser_fee));
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<FinanceDuplicate[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(initial ? { ok: true, text: `נשמר · עודכן ${formatDate(initial.updated_at)}` } : null);

  async function save(confirmDuplicate = false) {
    if ((hasVat && !toNum(vatOffset)) || (hasReinst && !toNum(reinstatement))) {
      setMsg({ ok: false, text: 'סימנת "כן" — נא להזין את הסכום' });
      return;
    }
    setSaving(true);
    setMsg(null);
    const r = await saveFinanceEntry(caseId, {
      closed_on: closedOn,
      work_source: source,
      insurer: insurer || null,
      claim_type: claimType || null,
      idf_category: idfCategory || null,
      appraiser: appraiser ? normalizeAppraiser(appraiser) : null,
      amount_ours: toNum(amount),
      amount_shir: toNum(amountShir),
      invoice_number: invoice || null,
      deductible: toNum(deductible),
      job_card_no: jobCard || null,
      claim_check_due_date: claimType === "צד ג'" ? claimCheckDue || null : null,
      deposit_check_due_date: hasDeposit ? depositDue || null : null,
      claim_check_amount: claimType === "צד ג'" ? toNum(claimCheckAmount) : null,
      deposit_check_amount: hasDeposit ? toNum(depositAmount) : null,
      vat_offset: hasVat ? toNum(vatOffset) : null,
      reinstatement: hasReinst ? toNum(reinstatement) : null,
      appraiser_fee: claimType === "צד ג'" ? toNum(appraiserFee) : null,
    }, confirmDuplicate);
    setSaving(false);
    if (r.duplicates?.length) {
      setDuplicates(r.duplicates);
      return;
    }
    setDuplicates(null);
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: 'נשמר ✓ — מופיע בדשבורד הכספים' });
    if (!r.error) onSaved?.();
  }

  const input = 'w-full h-10 px-3 rounded-lg border border-gray-300 text-sm bg-white';
  const label = 'block text-xs text-gray-500 mb-1';

  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">💰 נתוני סגירה לכספים</h2>
        {!initial && <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">טרם הוזן · חובה לפני סגירת התיק</span>}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {(Object.keys(WORK_SOURCE_LABEL) as WorkSource[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setSource(k)}
            className={`h-9 px-3 rounded-lg border text-sm ${source === k ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 bg-white'}`}
          >
            {WORK_SOURCE_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className={label}>תאריך סגירה</label>
          <input type="date" value={closedOn} onChange={(e) => setClosedOn(e.target.value)} className={input} />
        </div>
        {source !== 'SHIR' && (
          <div>
            <label className={label}>חברת ביטוח (בצד ג׳ — החברה הנתבעת)</label>
            <input list="fin-insurers" value={insurer} onChange={(e) => setInsurer(e.target.value)} className={input} />
          </div>
        )}
        <div>
          <label className={label}>סוג תביעה</label>
          <select value={claimType} onChange={(e) => setClaimType(e.target.value)} className={input}>
            <option value="">—</option>
            {CLAIM_TYPES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        {source === 'IDF' && (
          <div>
            <label className={label}>קטגוריית צה״ל</label>
            <select value={idfCategory} onChange={(e) => setIdfCategory(e.target.value)} className={input}>
              <option value="">—</option>
              {IDF_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={label}>שמאי</label>
          <input list="fin-appraisers" value={appraiser} onChange={(e) => setAppraiser(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>{source === 'SHIR' ? 'חשבונית כולל מע״מ — עם ההנחות שלנו' : 'סכום חשבונית כולל מע״מ'} *</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={input} dir="ltr" />
        </div>
        {source === 'SHIR' && (
          <div>
            <label className={label}>חשבונית ש.י.ר כולל מע״מ — ללא הנחות</label>
            <input value={amountShir} onChange={(e) => setAmountShir(e.target.value)} inputMode="decimal" className={input} dir="ltr" />
          </div>
        )}
        <div>
          <label className={label}>מספר חשבונית</label>
          <input value={invoice} onChange={(e) => setInvoice(e.target.value)} className={input} dir="ltr" />
        </div>
        <div>
          <label className={label}>השתתפות עצמית</label>
          <input value={deductible} onChange={(e) => setDeductible(e.target.value)} inputMode="decimal" className={input} dir="ltr" />
        </div>
        <YesNoAmount label="מתקזז מע״מ?" yes={hasVat} setYes={setHasVat} amount={vatOffset} setAmount={setVatOffset} input={input} labelClass={label} />
        <YesNoAmount label="כינון?" yes={hasReinst} setYes={setHasReinst} amount={reinstatement} setAmount={setReinstatement} input={input} labelClass={label} />
        {claimType === "צד ג'" && (
          <div>
            <label className={label}>שכר טרחת שמאי</label>
            <input value={appraiserFee} onChange={(e) => setAppraiserFee(e.target.value)} inputMode="decimal" className={input} dir="ltr" />
          </div>
        )}
        <div>
          <label className={label}>מספר כרטיס עבודה</label>
          <input value={jobCard} onChange={(e) => setJobCard(e.target.value)} className={input} dir="ltr" />
        </div>
        {claimType === "צד ג'" && (
          <div>
            <label className={label}>צ׳ק תביעות (צד ג׳) — מועד פירעון וסכום</label>
            <div className="flex gap-2">
              <input type="date" value={claimCheckDue} onChange={(e) => setClaimCheckDue(e.target.value)} className={input} aria-label="מועד פירעון צ׳ק תביעות" />
              <input value={claimCheckAmount} onChange={(e) => setClaimCheckAmount(e.target.value)} inputMode="decimal" placeholder="סכום ₪" className={input} dir="ltr" aria-label="סכום צ׳ק תביעות" />
            </div>
          </div>
        )}
        <div>
          <label className="flex items-center gap-2 text-xs text-gray-500 mb-1 cursor-pointer">
            <input type="checkbox" checked={hasDeposit} onChange={(e) => setHasDeposit(e.target.checked)} className="w-4 h-4" />
            יש צ׳ק פיקדון
          </label>
          {hasDeposit && (
            <div className="flex gap-2">
              <input type="date" value={depositDue} onChange={(e) => setDepositDue(e.target.value)} className={input} aria-label="מועד פירעון צ׳ק פיקדון" />
              <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} inputMode="decimal" placeholder="סכום ₪" className={input} dir="ltr" aria-label="סכום צ׳ק פיקדון" />
            </div>
          )}
        </div>
      </div>

      <datalist id="fin-insurers">
        {INSURERS.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>
      <datalist id="fin-appraisers">
        {APPRAISERS.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>

      {duplicates && (
        <div className="mt-4 p-4 rounded-xl border-2 border-amber-300 bg-amber-50 space-y-2">
          <p className="font-bold text-amber-900">⚠️ שים/י לב — ייתכן שזו הקלדה כפולה</p>
          <ul className="text-sm text-amber-900 space-y-0.5">
            {duplicates.map((d, i) => (
              <li key={i}>
                {d.reason === 'invoice' ? `חשבונית ${d.invoice_number} כבר הוזנה` : `לרכב ${d.plate} כבר הוזנה סגירה`}
                {' · '}
                {formatDate(d.closed_on)} · ₪{Math.round(d.amount_ours).toLocaleString('he-IL')}
              </li>
            ))}
          </ul>
          <p className="text-sm text-amber-900">האם מדובר בשני נזקים שונים, או שזו הקלדה כפולה?</p>
          <div className="flex gap-2 flex-wrap">
            <button type="button" disabled={saving} onClick={() => void save(true)} className="h-10 px-4 rounded-lg bg-amber-600 text-white text-sm font-semibold disabled:opacity-50">
              שני נזקים שונים — אני מאשר/ת, שמור
            </button>
            <button type="button" onClick={() => setDuplicates(null)} className="h-10 px-4 rounded-lg border border-gray-300 bg-white text-sm">
              הקלדה כפולה — בטל
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mt-4">
        <button type="button" onClick={() => void save()} disabled={saving} className="h-10 px-5 rounded-lg bg-[#1e3a5f] text-white text-sm font-semibold disabled:opacity-50">
          {saving ? 'שומר…' : initial ? 'עדכן' : 'שמור'}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

/** כן / לא, and the amount only when "כן". */
function YesNoAmount({
  label,
  yes,
  setYes,
  amount,
  setAmount,
  input,
  labelClass,
}: {
  label: string;
  yes: boolean | null;
  setYes: (v: boolean) => void;
  amount: string;
  setAmount: (v: string) => void;
  input: string;
  labelClass: string;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="flex gap-2 items-center">
        {([true, false] as const).map((v) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => setYes(v)}
            className={`h-10 px-4 rounded-lg border text-sm font-semibold ${yes === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-300'}`}
          >
            {v ? 'כן' : 'לא'}
          </button>
        ))}
        {yes && (
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="סכום ₪"
            aria-label={`${label} סכום`}
            className={`${input} flex-1`}
            dir="ltr"
          />
        )}
      </div>
    </div>
  );
}
