'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCase } from '@/app/actions/workflow';
import { lookupVehicleByPlate } from '@/app/actions/vehicleLookup';
import { createClient } from '@/lib/supabase/client';
import { Plus, X, Loader2 } from 'lucide-react';
import type { ClaimType, SubClaimType } from '@/types/database';

interface Branch {
  id: string;
  name: string;
}

const INSURANCE_COMPANIES = [
  'מנורה מבטחים',
  'הראל ביטוח',
  'כלל ביטוח',
  'הפניקס',
  'איילון',
  'מגדל ביטוח',
  'שלמה רשת מוסכים',
  'ביטוח ישיר',
  'AIG',
  'אנקור',
  'הכשרה ביטוח',
  'אחר',
];

// Prefill shape accepted from a referral ("צור תיק מהפנייה") — a subset of
// `form`'s fields, all optional since a referral may have some blank.
export interface CreateCaseInitialValues {
  plate_number?: string;
  vehicle_type?: string;
  vehicle_year?: string;
  customer_name?: string;
  phone?: string;
  insurance_company?: string;
  appraiser_name?: string;
  claim_type?: ClaimType | '';
  branch_id?: string;
}

export function CreateCaseButton({
  branchIds = [],
  isCeo = false,
  initialValues,
  triggerLabel,
  onCreated,
}: {
  branchIds?: string[];
  isCeo?: boolean;
  // The rest support opening this dialog pre-filled from a referral instead
  // of the plain "פתיחת תיק" entry point — same form/action, different
  // starting values and a hook to react to the created case (used to mark
  // the referral CONVERTED). Whoever has case-creation permission can use
  // this regardless of who originally logged the referral.
  initialValues?: CreateCaseInitialValues;
  triggerLabel?: string;
  onCreated?: (caseId: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState({
    plate_number: initialValues?.plate_number ?? '',
    vehicle_type: initialValues?.vehicle_type ?? '',
    vehicle_year: initialValues?.vehicle_year ?? '',
    customer_name: initialValues?.customer_name ?? '',
    phone: initialValues?.phone ?? '',
    insurance_company: initialValues?.insurance_company ?? '',
    appraiser_name: initialValues?.appraiser_name ?? '',
    event_date: '',
    claim_number: '',
    claim_type: initialValues?.claim_type ?? ('' as ClaimType | ''),
    sub_claim_type: '' as SubClaimType | '',
    sub_claim_type_other_text: '',
    branch_id: initialValues?.branch_id ?? branchIds?.[0] ?? '',
  });
  const [files, setFiles] = useState<File[]>([]);
  const [vehicleLookupState, setVehicleLookupState] = useState<'idle' | 'loading' | 'found' | 'not-found' | 'error'>('idle');
  const [vehicleLookupError, setVehicleLookupError] = useState<string | null>(null);

  async function handlePlateBlur() {
    const digits = form.plate_number.replace(/\D/g, '');
    if (!digits) {
      setVehicleLookupState('idle');
      setVehicleLookupError(null);
      return;
    }
    setVehicleLookupState('loading');
    setVehicleLookupError(null);
    const res = await lookupVehicleByPlate(form.plate_number);
    if (res.error) {
      setVehicleLookupState('error');
      setVehicleLookupError(res.error);
      return;
    }
    if (!res.vehicle_type && !res.vehicle_year) {
      setVehicleLookupState('not-found');
      return;
    }
    setForm((f) => ({
      ...f,
      vehicle_type: res.vehicle_type ?? f.vehicle_type,
      vehicle_year: res.vehicle_year ? String(res.vehicle_year) : f.vehicle_year,
    }));
    setVehicleLookupState('found');
  }

  async function handleRetryLookup() {
    await handlePlateBlur();
  }

  // Calculate vehicle age from year
  const vehicleAge = form.vehicle_year
    ? new Date().getFullYear() - parseInt(form.vehicle_year)
    : null;

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Cross-branch staff (sees_all_branches → no fixed branch) and CEOs have no
  // default branch, so they must pick one — otherwise branch_id is empty and
  // createCase rejects it with "סניף לא תקין". OFFICE staff with multiple
  // branches should also pick for each case (branch_ids array).
  const needsBranchPicker = isCeo || branchIds.length === 0;

  async function handleOpen() {
    setOpen(true);
    // Re-sync from the latest initialValues on every open, not just this
    // component's own first mount — otherwise an edit made in the referral
    // detail view (this instance stays mounted the whole time) wouldn't show
    // up here unless the page was reloaded first. Real bug, caught live:
    // edited "שמאי" on a referral, then opened this dialog in the same visit
    // and it was still blank.
    if (initialValues) {
      setForm((f) => ({
        ...f,
        plate_number: initialValues.plate_number ?? f.plate_number,
        vehicle_type: initialValues.vehicle_type ?? f.vehicle_type,
        vehicle_year: initialValues.vehicle_year ?? f.vehicle_year,
        customer_name: initialValues.customer_name ?? f.customer_name,
        phone: initialValues.phone ?? f.phone,
        insurance_company: initialValues.insurance_company ?? f.insurance_company,
        appraiser_name: initialValues.appraiser_name ?? f.appraiser_name,
        claim_type: initialValues.claim_type ?? f.claim_type,
        branch_id: initialValues.branch_id ?? f.branch_id,
      }));
    }
    if (needsBranchPicker && branches.length === 0) {
      const supabase = createClient();
      const { data } = await supabase.from('branches').select('id, name');
      const loaded = (data ?? []) as Branch[];
      setBranches(loaded);
      if (loaded.length > 0 && !form.branch_id) {
        setForm((f) => ({ ...f, branch_id: loaded[0].id }));
      }
    }
  }

  function handleClose() {
    setOpen(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setLoading(true);
    const res = await createCase({
      plate_number: form.plate_number.trim(),
      claim_number: form.claim_number.trim() || null,
      claim_type: (form.claim_type as ClaimType) || null,
      sub_claim_type: (form.sub_claim_type as SubClaimType) || null,
      sub_claim_type_other_text: form.sub_claim_type === 'OTHER' ? (form.sub_claim_type_other_text.trim() || null) : null,
      branch_id: form.branch_id,
      customer_name: form.customer_name.trim() || null,
      phone: form.phone.trim() || null,
      insurance_company: form.insurance_company.trim() || null,
      appraiser_name: form.appraiser_name.trim() || null,
      event_date: form.event_date || null,
      vehicle_type: form.vehicle_type.trim() || null,
      vehicle_year: form.vehicle_year ? parseInt(form.vehicle_year) : null,
    });
    setLoading(false);
    if (res?.error) {
      setError(res.error);
      return;
    }

    const newCaseId = res?.caseId;
    const failedUploads: string[] = [];
    if (newCaseId && files.length > 0) {
      const { uploadCaseDocument } = await import('@/app/actions/documents');
      for (const file of files) {
        const formData = new FormData();
        formData.append('case_id', newCaseId);
        formData.append('file', file);
        const uploadRes = await uploadCaseDocument(formData);
        if (uploadRes?.error) {
          failedUploads.push(`${file.name}: ${uploadRes.error}`);
        }
      }
    }

    if (failedUploads.length > 0) {
      setError(
        `התיק נפתח, אך ${failedUploads.length} מתוך ${files.length} קבצים לא הועלו:\n${failedUploads.join('\n')}`
      );
      // Keep dialog open so user can see the error
      router.refresh();
      return;
    }

    setOpen(false);
    setError(null);
    setForm({
      plate_number: '',
      vehicle_type: '',
      vehicle_year: '',
      customer_name: '',
      phone: '',
      insurance_company: '',
      appraiser_name: '',
      event_date: '',
      claim_number: '',
      claim_type: '',
      sub_claim_type: '',
      sub_claim_type_other_text: '',
      branch_id: branchIds?.[0] ?? '',
    });
    setFiles([]);
    if (newCaseId && onCreated) {
      // Referral flow: let the caller decide navigation (e.g. mark the
      // referral converted, then go to the new case) instead of the default.
      onCreated(newCaseId);
    } else {
      router.push('/cases');
    }
    router.refresh();
  }

  // Enter used to submit the whole form immediately (native <form> behavior)
  // the moment the user hit Enter after typing the plate — before this, only
  // clicking "צור תיק" was supposed to open the case. Enter now just moves
  // focus to the next field instead, like Tab. Doesn't fire on the submit
  // button itself either, so a stray Enter there can't open the case — only
  // an actual click can.
  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA') return; // allow multiline fields to keep native Enter behavior
    e.preventDefault();
    const form = e.currentTarget;
    const focusable = Array.from(
      form.querySelectorAll<HTMLElement>('input, select, textarea, button')
    ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1 && el.offsetParent !== null);
    const idx = focusable.indexOf(target);
    if (idx > -1 && idx < focusable.length - 1) {
      focusable[idx + 1].focus();
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-brand-red focus:ring-2 focus:ring-brand-red/10 outline-none transition-all bg-gray-50 focus:bg-white';
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5';

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-2 px-4 py-2.5 bg-brand-red hover:bg-brand-red-dark text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
      >
        <Plus size={16} />
        {triggerLabel ?? 'פתיחת תיק'}
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          dir="rtl"
          onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-2xl w-full overflow-y-auto max-h-[95vh] sm:max-h-[92vh]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-gray-800">פתיחת תיק חדש</h2>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="p-4 sm:p-6 space-y-5">
              {/* ── פרטי רכב ── */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">פרטי רכב</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>מספר רישוי *</label>
                    <input
                      type="text"
                      required
                      value={form.plate_number}
                      onChange={(e) => {
                        set('plate_number', e.target.value);
                        setVehicleLookupState('idle');
                      }}
                      onBlur={handlePlateBlur}
                      className={inputCls}
                      dir="ltr"
                      placeholder="12-345-67"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>
                      סוג רכב
                      {vehicleLookupState === 'loading' && (
                        <span className="mr-2 inline-flex items-center gap-1 text-xs font-normal text-gray-400">
                          <Loader2 size={12} className="animate-spin" /> מאתר במשרד התחבורה...
                        </span>
                      )}
                      {vehicleLookupState === 'not-found' && (
                        <span className="mr-2 text-xs font-normal text-amber-600">לא נמצא ברשימת משרד התחבורה</span>
                      )}
                      {vehicleLookupState === 'error' && (
                        <span className="mr-2 inline-flex items-center gap-1 text-xs font-normal text-red-600">
                          ⚠️ {vehicleLookupError}
                          <button
                            type="button"
                            onClick={handleRetryLookup}
                            className="ml-1 text-xs underline hover:text-red-700 font-medium"
                          >
                            נסה שוב
                          </button>
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={form.vehicle_type}
                      onChange={(e) => set('vehicle_type', e.target.value)}
                      className={inputCls}
                      placeholder="יונדאי i20"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>
                      שנת הרכב
                      {vehicleAge !== null && (
                        <span className={`mr-2 text-xs font-normal px-2 py-0.5 rounded-full ${
                          vehicleAge > 2 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                        }`}>
                          גיל: {vehicleAge} שנים
                          {vehicleAge > 2 ? ' — נדרש בדיקת גלגלים' : ''}
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      min={1990}
                      max={new Date().getFullYear() + 1}
                      value={form.vehicle_year}
                      onChange={(e) => set('vehicle_year', e.target.value)}
                      className={inputCls}
                      dir="ltr"
                      placeholder="2022"
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>

              {/* ── פרטי לקוח ── */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">פרטי לקוח</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>שם לקוח</label>
                    <input
                      type="text"
                      value={form.customer_name}
                      onChange={(e) => set('customer_name', e.target.value)}
                      className={inputCls}
                      placeholder="ישראל ישראלי"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>טלפון</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => set('phone', e.target.value)}
                      className={inputCls}
                      dir="ltr"
                      placeholder="050-1234567"
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>

              {/* ── פרטי ביטוח ── */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">פרטי ביטוח ותביעה</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>חברת ביטוח</label>
                    <select
                      value={form.insurance_company}
                      onChange={(e) => set('insurance_company', e.target.value)}
                      className={inputCls}
                    >
                      <option value="">— בחר חברה —</option>
                      {INSURANCE_COMPANIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>שמאי</label>
                    <input
                      type="text"
                      value={form.appraiser_name}
                      onChange={(e) => set('appraiser_name', e.target.value)}
                      className={inputCls}
                      placeholder="שם השמאי"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>תאריך אירוע</label>
                    <input
                      type="date"
                      value={form.event_date}
                      onChange={(e) => set('event_date', e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>מספר תביעה</label>
                    <input
                      type="text"
                      value={form.claim_number}
                      onChange={(e) => set('claim_number', e.target.value)}
                      className={inputCls}
                      dir="ltr"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>סוג תביעה</label>
                    <select
                      value={form.claim_type}
                      onChange={(e) => set('claim_type', e.target.value)}
                      className={inputCls}
                    >
                      <option value="">—</option>
                      <option value="PRIVATE">פרטי</option>
                      <option value="ACCIDENT">תאונה</option>
                      <option value="FLOOD">הצפה</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>תת סוג תביעה</label>
                    <select
                      value={form.sub_claim_type}
                      onChange={(e) => set('sub_claim_type', e.target.value)}
                      className={inputCls}
                    >
                      <option value="">—</option>
                      <option value="POLICY">פוליסה</option>
                      <option value="THIRD_PARTY">צד ג&apos;</option>
                      <option value="THIRD_PARTY_SETTLEMENT">הסדר ג&apos;</option>
                      <option value="PRIVATE_REPAIR">תיקון פרטי</option>
                      <option value="SHLOMO_POLICY">מוקד שלמה פוליסה</option>
                      <option value="SHLOMO_THIRD_PARTY">מוקד שלמה צד ג&apos;</option>
                      <option value="MILITARY">צה&quot;ל</option>
                      <option value="OTHER">אחר</option>
                    </select>
                    {form.sub_claim_type === 'OTHER' && (
                      <input
                        type="text"
                        value={form.sub_claim_type_other_text}
                        onChange={(e) => set('sub_claim_type_other_text', e.target.value)}
                        className={`${inputCls} mt-2`}
                        placeholder="פרט את סוג התביעה"
                        autoComplete="off"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* ── סניף (CEO + צוות חוצה-סניפים) ── */}
              {needsBranchPicker && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">סניף</p>
                  {branches.length > 0 ? (
                    <select
                      value={form.branch_id}
                      onChange={(e) => set('branch_id', e.target.value)}
                      className={inputCls}
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div className={`${inputCls} text-gray-400`}>טוען סניפים...</div>
                  )}
                </div>
              )}

              {/* ── קבצים ── */}
              <div>
                <label className={labelCls}>קבצים מצורפים (אופציונלי)</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center justify-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 cursor-pointer transition-colors">
                    📁 בחר קבצים
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files || [])])}
                      className="hidden"
                    />
                  </label>
                  <label className="flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-sm font-medium text-blue-700 cursor-pointer transition-colors">
                    📷 צלם במצלמה
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files || [])])}
                      className="hidden"
                    />
                  </label>
                </div>
                {files.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-gray-50 px-2 py-1 rounded">
                        <span className="truncate">{f.name} ({(f.size / 1024).toFixed(0)} KB)</span>
                        <button
                          type="button"
                          onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                          className="text-gray-400 hover:text-red-600 ml-2 shrink-0"
                          aria-label="הסר קובץ"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div className="text-sm text-red-700 bg-red-50 px-4 py-3 rounded-lg border border-red-100 flex items-center gap-2">
                  <X size={14} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* ── כפתורים ── */}
              <div className="flex gap-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-5 py-2.5 bg-brand-red hover:bg-brand-red-dark text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors shadow-sm"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      יוצר תיק...
                    </span>
                  ) : 'צור תיק'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
