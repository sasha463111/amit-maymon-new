'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCase } from '@/app/actions/workflow';
import type { InsuranceType, ClaimType, SubClaimType } from '@/types/database';

interface Branch {
  id: string;
  name: string;
}

export function CreateCaseButton({
  branchId,
  branches = [],
  isCeo = false,
}: {
  branchId: string | null;
  branches?: Branch[];
  isCeo?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    insurance_type: '' as InsuranceType | '',
    claim_type: '' as ClaimType | '',
    sub_claim_type: '' as SubClaimType | '',
    branch_id: branchId ?? (branches[0]?.id ?? ''),
  });
  const [files, setFiles] = useState<File[]>([]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await createCase({
      plate_number: form.plate_number.trim(),
      claim_number: form.claim_number.trim() || null,
      insurance_type: (form.insurance_type as InsuranceType) || null,
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
      insurance_type: '',
      claim_type: '',
      sub_claim_type: '',
      branch_id: branchId ?? branches[0]?.id ?? '',
    });
    setFiles([]);
    router.push('/cases');
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
      >
        פתיחת תיק
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full p-6 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">פתיחת תיק חדש</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* ── פרטי רכב ── */}
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">פרטי רכב</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">מספר רישוי *</label>
                    <input
                      type="text"
                      required
                      value={form.plate_number}
                      onChange={(e) => set('plate_number', e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                      dir="ltr"
                      placeholder="12-345-67"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">סוג רכב</label>
                    <input
                      type="text"
                      value={form.vehicle_type}
                      onChange={(e) => set('vehicle_type', e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                      placeholder="יונדאי i20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">שנת הרכב</label>
                    <input
                      type="number"
                      min={1990}
                      max={new Date().getFullYear() + 1}
                      value={form.vehicle_year}
                      onChange={(e) => set('vehicle_year', e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                      dir="ltr"
                      placeholder="2022"
                    />
                  </div>
                </div>
              </div>

              {/* ── פרטי לקוח ── */}
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">פרטי לקוח</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">שם לקוח</label>
                    <input
                      type="text"
                      value={form.customer_name}
                      onChange={(e) => set('customer_name', e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                      placeholder="ישראל ישראלי"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">טלפון</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => set('phone', e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                      dir="ltr"
                      placeholder="050-1234567"
                    />
                  </div>
                </div>
              </div>

              {/* ── פרטי ביטוח ── */}
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">פרטי ביטוח ותביעה</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">חברת ביטוח</label>
                    <input
                      type="text"
                      value={form.insurance_company}
                      onChange={(e) => set('insurance_company', e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                      placeholder="מנורה / הראל / כלל..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">שמאי</label>
                    <input
                      type="text"
                      value={form.appraiser_name}
                      onChange={(e) => set('appraiser_name', e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                      placeholder="שם השמאי"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">תאריך אירוע</label>
                    <input
                      type="date"
                      value={form.event_date}
                      onChange={(e) => set('event_date', e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">מספר תביעה</label>
                    <input
                      type="text"
                      value={form.claim_number}
                      onChange={(e) => set('claim_number', e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">סוג ביטוח</label>
                    <select
                      value={form.insurance_type}
                      onChange={(e) => set('insurance_type', e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                    >
                      <option value="">—</option>
                      <option value="COMPREHENSIVE">מקיף</option>
                      <option value="THIRD_PARTY">צד ג׳</option>
                      <option value="PRIVATE">פרטי</option>
                      <option value="OTHER">אחר</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">סוג תביעה</label>
                    <select
                      value={form.claim_type}
                      onChange={(e) => set('claim_type', e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                    >
                      <option value="">—</option>
                      <option value="PRIVATE">פרטי</option>
                      <option value="ACCIDENT">תאונה</option>
                      <option value="FLOOD">הצפה</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">תת סוג תביעה</label>
                    <select
                      value={form.sub_claim_type}
                      onChange={(e) => set('sub_claim_type', e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
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
              {isCeo && branches.length > 0 && (
                <div className="border-t pt-3">
                  <label className="block text-sm font-medium mb-1">סניף</label>
                  <select
                    value={form.branch_id}
                    onChange={(e) => set('branch_id', e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* ── קבצים ── */}
              <div className="border-t pt-3">
                <label className="block text-sm font-medium mb-1">קבצים מצורפים (אופציונלי)</label>
                <input
                  type="file"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
                {files.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    {files.length} קבצים נבחרו: {files.map((f) => f.name).join(', ')}
                  </p>
                )}
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">⚠️ {error}</p>}

              <div className="flex gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 border rounded text-sm"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
                >
                  {loading ? 'יוצר...' : 'צור תיק'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
