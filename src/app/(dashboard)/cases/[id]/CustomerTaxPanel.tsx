'use client';

import { useCallback, useEffect, useState } from 'react';
import { getCustomerTax, saveCustomerTax, type CustomerTax, type CustomerTaxPatch } from '@/app/actions/customerTax';
import { TAX_LOOKUP_URL, VAT_SHARE_LABEL, VAT_STATUS_LABEL, validEmail, validIsraeliId, type VatShare, type VatStatus } from '@/lib/customerTax';
import { formatDate } from '@/lib/dates';

// "פרטי לקוח ומע״מ" (Amit, 2026-10-14): ID + email, and whether the customer
// has a VAT file — if so, ask for the CPA letter (offset share) while the car
// is still here, not a month after the insurer offsets the VAT.

const STATUSES: VatStatus[] = ['NONE', 'DEALER', 'COMPANY'];
const SHARES: VatShare[] = ['THIRD', 'TWO_THIRDS', 'FULL'];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-gray-400 whitespace-nowrap">{label}:</dt>
      <dd className="min-w-0 break-words text-gray-900">{children}</dd>
    </>
  );
}

export function CustomerTaxPanel({ caseId }: { caseId: string }) {
  const [t, setT] = useState<CustomerTax | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [idNum, setIdNum] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await getCustomerTax(caseId);
    setT(r);
    setIdNum(r?.id_number ?? '');
    setEmail(r?.email ?? '');
    setLoaded(true);
  }, [caseId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded || !t) return null; // not loaded yet, or a role that doesn't see it

  async function save(p: CustomerTaxPatch, ok?: string) {
    setBusy(true);
    setMsg(null);
    const r = await saveCustomerTax(caseId, p);
    setBusy(false);
    if (r.error) return setMsg(`⚠️ ${r.error}`);
    if (ok) setMsg(ok);
    await load();
  }

  async function openTax() {
    if (idNum && validIsraeliId(idNum)) {
      try {
        await navigator.clipboard.writeText(idNum.replace(/\D/g, ''));
        setMsg('✓ מספר הזהות הועתק — מדביקים אותו באתר רשות המסים בשדה "מספר עוסק"');
      } catch {
        setMsg(`מקלידים באתר רשות המסים את המספר ${idNum}`);
      }
    }
    window.open(TAX_LOOKUP_URL, '_blank', 'noopener');
  }

  const hasFile = t.vat_status === 'DEALER' || t.vat_status === 'COMPANY';
  const idDirty = idNum.trim() !== (t.id_number ?? '');
  const emailDirty = email.trim().toLowerCase() !== (t.email ?? '');
  const input = 'h-10 px-3 rounded-lg border border-gray-300 text-sm bg-white w-full';
  const chip = (on: boolean) => `h-9 px-3 rounded-lg border text-sm font-semibold ${on ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300'} disabled:opacity-50`;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3" dir="rtl">
      <h3 className="font-bold text-gray-900">🧾 פרטי לקוח ומע״מ</h3>

      {!t.vat_status && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm space-y-1">
          <p className="font-bold text-amber-900">⚠️ לא נבדק אם ללקוח יש תיק מע״מ</p>
          <p className="text-amber-900">אם יש — הוא מתקזז על מע״מ הרכב, וצריך לבקש ממנו אישור רו״ח כל עוד הרכב אצלנו.</p>
          {t.company_hint && <p className="font-semibold text-red-700">נראה כמו חברה (בע״מ / ח.פ) — כמעט בוודאות מתקזז.</p>}
          {t.previous && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span>
                לפי תיק קודם של הלקוח: <b>{VAT_STATUS_LABEL[t.previous.vat_status]}</b>
                {t.previous.vat_share ? ` · קיזוז ${VAT_SHARE_LABEL[t.previous.vat_share]}` : ''}
                {t.previous.checked_at ? ` · נבדק ${formatDate(t.previous.checked_at)}` : ''}
              </span>
              <button type="button" disabled={busy} onClick={() => void save({ vat_status: t.previous!.vat_status, ...(t.previous!.vat_share ? { vat_share: t.previous!.vat_share } : {}) }, '✓ עודכן לפי התיק הקודם')} className="h-8 px-3 rounded-lg bg-amber-600 text-white text-xs font-bold disabled:opacity-50">
                להשתמש בזה
              </button>
            </div>
          )}
        </div>
      )}
      {hasFile && !t.cpa_received_at && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-sm">
          <p className="font-bold text-red-800">📄 לבקש מהלקוח אישור רו״ח על שיעור קיזוז המע״מ — לפני שהרכב יוצא</p>
          <p className="text-red-800">את החלק היחסי של המע״מ הלקוח משלם לנו; חברת הביטוח לא תשלם אותו.</p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-xs text-gray-500">
          ת״ז / ח.פ של הלקוח
          <div className="flex gap-2">
            <input value={idNum} onChange={(e) => setIdNum(e.target.value)} inputMode="numeric" dir="ltr" maxLength={12} className={input} placeholder="9 ספרות" />
            {idDirty && (
              <button type="button" disabled={busy} onClick={() => void save({ id_number: idNum }, '✓ נשמר')} className="h-10 px-4 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-50">
                שמירה
              </button>
            )}
          </div>
          {idNum && !validIsraeliId(idNum) && <span className="text-red-600">מספר לא תקין (ספרת ביקורת)</span>}
        </label>
        <label className="block text-xs text-gray-500">
          מייל הלקוח (רשות)
          <div className="flex gap-2">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" dir="ltr" className={input} placeholder="name@example.com" />
            {emailDirty && (
              <button type="button" disabled={busy || (!!email.trim() && !validEmail(email))} onClick={() => void save({ email }, '✓ נשמר')} className="h-10 px-4 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-50">
                שמירה
              </button>
            )}
          </div>
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => void openTax()} className="h-10 px-4 rounded-xl border-2 border-indigo-300 bg-indigo-50 text-indigo-900 text-sm font-bold">
            🔎 בדיקה ברשות המסים
          </button>
          <span className="text-xs text-gray-500">נפתח האתר של רשות המסים עם המספר מועתק. לאדם — מספר העוסק הוא מספר הזהות.</span>
        </div>
        <p className="text-xs text-gray-500">תוצאת הבדיקה:</p>
        <div className="flex gap-1.5 flex-wrap">
          {STATUSES.map((s) => (
            <button key={s} type="button" disabled={busy} onClick={() => void save({ vat_status: s })} className={chip(t.vat_status === s)}>
              {VAT_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {hasFile && (
        <div className="space-y-2 rounded-xl bg-gray-50 p-3">
          <p className="text-xs text-gray-500">בכמה הלקוח מתקזז על הרכב (לפי אישור רו״ח):</p>
          <div className="flex gap-1.5 flex-wrap">
            {SHARES.map((s) => (
              <button key={s} type="button" disabled={busy} onClick={() => void save({ vat_share: s })} className={chip(t.vat_share === s)}>
                {VAT_SHARE_LABEL[s]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="w-5 h-5" checked={!!t.cpa_requested_at} disabled={busy} onChange={(e) => void save({ cpa_requested: e.target.checked })} />
            ביקשנו מהלקוח אישור רו״ח{t.cpa_requested_at ? ` (${formatDate(t.cpa_requested_at)})` : ''}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="w-5 h-5" checked={!!t.cpa_received_at} disabled={busy} onChange={(e) => void save({ cpa_received: e.target.checked })} />
            התקבל אישור רו״ח{t.cpa_received_at ? ` (${formatDate(t.cpa_received_at)})` : ''} — לסרוק ל&quot;מסמכים&quot; בתיק
          </label>
        </div>
      )}

      {t.vat_status && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <Row label="סטטוס מע״מ">{VAT_STATUS_LABEL[t.vat_status]}</Row>
          {hasFile && <Row label="שיעור קיזוז">{t.vat_share ? VAT_SHARE_LABEL[t.vat_share] : 'עוד לא ידוע'}</Row>}
          <Row label="נבדק">{`${t.checked_at ? formatDate(t.checked_at) : '—'}${t.checked_by ? ` · ${t.checked_by}` : ''}`}</Row>
        </dl>
      )}
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
