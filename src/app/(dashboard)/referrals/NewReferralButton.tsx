'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createReferral, uploadReferralDocument } from '@/app/actions/referrals';
import { lookupVehicleByPlate } from '@/app/actions/vehicleLookup';
import { createClient } from '@/lib/supabase/client';
import { Plus, X, Loader2 } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
}

const INSURANCE_COMPANIES = [
  'מנורה מבטחים', 'הראל ביטוח', 'כלל ביטוח', 'הפניקס', 'איילון',
  'מגדל ביטוח', 'שלמה רשת מוסכים', 'ביטוח ישיר', 'AIG', 'אנקור', 'הכשרה ביטוח', 'אחר',
];

export function NewReferralButton({ branchIds = [], isCeo = false }: { branchIds?: string[]; isCeo?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    customer_name: '',
    insurance_company: '',
    claim_type: '',
    vehicle_type: '',
    vehicle_year: '',
    plate_number: '',
    appraiser_name: '',
    phone: '',
    status_note: '',
    branch_id: branchIds?.[0] ?? '',
  });

  const needsBranchPicker = isCeo || branchIds.length === 0;
  // Same Ministry of Transport plate lookup as opening an accident case
  // (CreateCaseButton) — referrals previously required typing vehicle type
  // by hand even though the same auto-fill already exists elsewhere.
  const [vehicleLookupState, setVehicleLookupState] = useState<'idle' | 'loading' | 'found' | 'not-found'>('idle');

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handlePlateBlur() {
    const digits = form.plate_number.replace(/\D/g, '');
    if (!digits) {
      setVehicleLookupState('idle');
      return;
    }
    setVehicleLookupState('loading');
    const res = await lookupVehicleByPlate(form.plate_number);
    if (res.error || (!res.vehicle_type && !res.vehicle_year)) {
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

  async function handleOpen() {
    setOpen(true);
    if (needsBranchPicker && branches.length === 0) {
      const supabase = createClient();
      const { data } = await supabase.from('branches').select('id, name');
      const loaded = (data ?? []) as Branch[];
      setBranches(loaded);
      if (loaded.length > 0 && !form.branch_id) setForm((f) => ({ ...f, branch_id: loaded[0].id }));
    }
  }

  function handleClose() {
    setOpen(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await createReferral({
      branch_id: form.branch_id,
      customer_name: form.customer_name.trim() || null,
      insurance_company: form.insurance_company.trim() || null,
      claim_type: form.claim_type.trim() || null,
      vehicle_type: form.vehicle_type.trim() || null,
      vehicle_year: form.vehicle_year ? parseInt(form.vehicle_year, 10) : null,
      plate_number: form.plate_number.trim() || null,
      appraiser_name: form.appraiser_name.trim() || null,
      phone: form.phone.trim() || null,
      status_note: form.status_note.trim() || null,
    });

    if (res?.error) {
      setError(res.error);
      setLoading(false);
      return;
    }

    const referralId = res?.referralId;
    const failedUploads: string[] = [];
    if (referralId && files.length > 0) {
      for (const file of files) {
        const fd = new FormData();
        fd.append('referral_id', referralId);
        fd.append('file', file);
        const up = await uploadReferralDocument(fd);
        if (up?.error) failedUploads.push(`${file.name}: ${up.error}`);
      }
    }

    setLoading(false);
    if (failedUploads.length > 0) {
      setError(`ההפנייה נוצרה, אך ${failedUploads.length} מתוך ${files.length} קבצים לא הועלו:\n${failedUploads.join('\n')}`);
      router.refresh();
      return;
    }

    setOpen(false);
    setError(null);
    setForm({
      customer_name: '', insurance_company: '', claim_type: '', vehicle_type: '', vehicle_year: '',
      plate_number: '', appraiser_name: '', phone: '', status_note: '', branch_id: branchIds?.[0] ?? '',
    });
    setFiles([]);
    router.refresh();
  }

  // Same reasoning as CreateCaseButton — Enter moves to the next field
  // instead of submitting; only the button itself creates the referral.
  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    const formEl = e.currentTarget;
    const focusable = Array.from(formEl.querySelectorAll<HTMLElement>('input, select, textarea, button'))
      .filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1 && el.offsetParent !== null);
    const idx = focusable.indexOf(target);
    if (idx > -1 && idx < focusable.length - 1) focusable[idx + 1].focus();
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
        פתיחת הפנייה
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
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-gray-800">פתיחת הפנייה</h2>
              <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="p-4 sm:p-6 space-y-5">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">פרטי לקוח</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>שם לקוח</label>
                    <input type="text" value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} className={inputCls} placeholder="ישראל ישראלי" autoComplete="off" />
                  </div>
                  <div>
                    <label className={labelCls}>טלפון לקוח</label>
                    <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} dir="ltr" placeholder="050-1234567" autoComplete="off" />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">פרטי רכב</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>מספר רכב</label>
                    <input
                      type="text"
                      value={form.plate_number}
                      onChange={(e) => { set('plate_number', e.target.value); setVehicleLookupState('idle'); }}
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
                    </label>
                    <input type="text" value={form.vehicle_type} onChange={(e) => set('vehicle_type', e.target.value)} className={inputCls} placeholder="יונדאי i20" autoComplete="off" />
                  </div>
                  <div>
                    <label className={labelCls}>שנת רכב</label>
                    <input type="number" min={1990} max={new Date().getFullYear() + 1} value={form.vehicle_year} onChange={(e) => set('vehicle_year', e.target.value)} className={inputCls} dir="ltr" placeholder="2022" autoComplete="off" />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">פרטי ביטוח</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>חברת ביטוח</label>
                    <select value={form.insurance_company} onChange={(e) => set('insurance_company', e.target.value)} className={inputCls}>
                      <option value="">— בחר חברה —</option>
                      {INSURANCE_COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>סוג תביעה</label>
                    <input type="text" value={form.claim_type} onChange={(e) => set('claim_type', e.target.value)} className={inputCls} placeholder="לדוגמה: תאונה, צד ג'" autoComplete="off" />
                  </div>
                  <div>
                    <label className={labelCls}>שמאי</label>
                    <input type="text" value={form.appraiser_name} onChange={(e) => set('appraiser_name', e.target.value)} className={inputCls} placeholder="שם השמאי" autoComplete="off" />
                  </div>
                </div>
              </div>

              {needsBranchPicker && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">סניף</p>
                  {branches.length > 0 ? (
                    <select value={form.branch_id} onChange={(e) => set('branch_id', e.target.value)} className={inputCls}>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  ) : (
                    <div className={`${inputCls} text-gray-400`}>טוען סניפים...</div>
                  )}
                </div>
              )}

              <div>
                <label className={labelCls}>סטטוס הפנייה (טקסט חופשי)</label>
                <textarea value={form.status_note} onChange={(e) => set('status_note', e.target.value)} className={inputCls} rows={2} placeholder="לדוגמה: ממתין לתיאום עם הלקוח" />
              </div>

              <div>
                <label className={labelCls}>מסמכים מצורפים (אופציונלי)</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center justify-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 cursor-pointer transition-colors">
                    📁 בחר קבצים
                    <input type="file" multiple accept="image/*,application/pdf" onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files || [])])} className="hidden" />
                  </label>
                  <label className="flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-sm font-medium text-blue-700 cursor-pointer transition-colors">
                    📷 צלם במצלמה
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files || [])])} className="hidden" />
                  </label>
                </div>
                {files.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-gray-50 px-2 py-1 rounded">
                        <span className="truncate">{f.name} ({(f.size / 1024).toFixed(0)} KB)</span>
                        <button type="button" onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-600 ml-2 shrink-0" aria-label="הסר קובץ">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div className="text-sm text-red-700 bg-red-50 px-4 py-3 rounded-lg border border-red-100 flex items-center gap-2 whitespace-pre-wrap">
                  <X size={14} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2 border-t border-gray-100">
                <button type="button" onClick={handleClose} className="px-5 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  ביטול
                </button>
                <button type="submit" disabled={loading} className="flex-1 px-5 py-2.5 bg-brand-red hover:bg-brand-red-dark text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors shadow-sm">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin" /> יוצר הפנייה...
                    </span>
                  ) : 'צור הפנייה'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
