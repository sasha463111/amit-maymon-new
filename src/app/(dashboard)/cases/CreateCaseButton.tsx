'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCase } from '@/app/actions/workflow';
import { createClient } from '@/lib/supabase/client';
import { Plus, X } from 'lucide-react';
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

export function CreateCaseButton({
  branchId,
  isCeo = false,
}: {
  branchId: string | null;
  isCeo?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState({
    plate_number: '',
    vehicle_type: '',
    vehicle_year: '',
    customer_name: '',
    phone: '',
    insurance_company: '',
    appraiser_name: '',
    event_date: '',
    claim_number: '',
    claim_type: '' as ClaimType | '',
    sub_claim_type: '' as SubClaimType | '',
    branch_id: branchId ?? '',
  });
  const [files, setFiles] = useState<File[]>([]);

  // Calculate vehicle age from year
  const vehicleAge = form.vehicle_year
    ? new Date().getFullYear() - parseInt(form.vehicle_year)
    : null;

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleOpen() {
    setOpen(true);
    if (isCeo && branches.length === 0) {
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
    if (newCaseId && files.length > 0) {
      const { uploadCaseDocument } = await import('@/app/actions/documents');
      for (const file of files) {
        const formData = new FormData();
        formData.append('case_id', newCaseId);
        formData.append('file', file);
        await uploadCaseDocument(formData);
      }
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
      branch_id: branchId ?? '',
    });
    setFiles([]);
    router.push('/cases');
    router.refresh();
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
        פתיחת תיק
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          dir="rtl"
          onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-y-auto max-h-[92vh]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">פתיחת תיק חדש</h2>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* ── פרטי רכב ── */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">פרטי רכב</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>מספר רישוי *</label>
                    <input
                      type="text"
                      required
                      value={form.plate_number}
                      onChange={(e) => set('plate_number', e.target.value)}
                      className={inputCls}
                      dir="ltr"
                      placeholder="12-345-67"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>סוג רכב</label>
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
                <div className="grid grid-cols-2 gap-4">
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
                <div className="grid grid-cols-2 gap-4">
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
                    </select>
                  </div>
                </div>
              </div>

              {/* ── סניף (CEO בלבד) ── */}
              {isCeo && (
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
                <input
                  type="file"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-gray-100 file:text-gray-700 file:text-sm"
                />
                {files.length > 0 && (
                  <p className="mt-1.5 text-xs text-gray-500">
                    {files.length} קבצים: {files.map((f) => f.name).join(', ')}
                  </p>
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
