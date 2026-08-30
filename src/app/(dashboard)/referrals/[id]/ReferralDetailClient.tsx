'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CreateCaseButton } from '../../cases/CreateCaseButton';
import { DocumentsSection, type CaseDocument } from '../../cases/[id]/DocumentsSection';
import {
  updateReferral, cancelReferral, uploadReferralDocument, deleteReferralDocument, convertReferral,
  addReferralStatusUpdate, setReferralFollowUpDate, type ReferralStatusTag, type ReferralStatusUpdateRow,
} from '@/app/actions/referrals';
import { lookupVehicleByPlate } from '@/app/actions/vehicleLookup';
import type { Referral, ReferralDocument } from '@/types/database';

const STATUS_TAG_LABELS: Record<ReferralStatusTag, string> = {
  AWAITING_REPLACEMENT_CAR: 'ממתין לרכב חלופי',
  AWAITING_PAPERWORK: 'ממתין לניירת',
  AWAITING_SCHEDULING: 'ממתין לתיאום',
  OTHER: 'אחר',
};

function Field({
  label, value, onSave, dir,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  dir?: 'ltr' | 'rtl';
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="text-gray-500 font-medium min-w-[7.5rem] flex-shrink-0">{label}:</span>
      <input
        type="text"
        value={local}
        dir={dir}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onSave(local); }}
        className="flex-1 border border-transparent hover:border-gray-200 focus:border-blue-400 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-400 transition-colors"
      />
    </div>
  );
}

export function ReferralDetailClient({
  referral,
  branchName,
  documents: initialDocuments,
  initialStatusUpdates,
}: {
  referral: Referral;
  branchName: string;
  documents: ReferralDocument[];
  initialStatusUpdates: ReferralStatusUpdateRow[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState({
    customer_name: referral.customer_name ?? '',
    insurance_company: referral.insurance_company ?? '',
    claim_type: referral.claim_type ?? '',
    vehicle_type: referral.vehicle_type ?? '',
    vehicle_year: referral.vehicle_year?.toString() ?? '',
    plate_number: referral.plate_number ?? '',
    appraiser_name: referral.appraiser_name ?? '',
    phone: referral.phone ?? '',
    status_note: referral.status_note ?? '',
    follow_up_date: referral.follow_up_date ?? '',
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  // Same Ministry of Transport plate lookup as CreateCaseButton — auto-fills
  // vehicle type/year when the plate is entered or edited here, matching
  // what already happens when opening an accident case directly.
  const [vehicleLookupState, setVehicleLookupState] = useState<'idle' | 'loading' | 'found' | 'not-found'>('idle');

  const [documents, setDocuments] = useState<CaseDocument[]>(
    initialDocuments.map((d) => ({ id: d.id, file_name: d.file_name, file_path: d.file_path, file_size: d.file_size, mime_type: d.mime_type, created_at: d.created_at }))
  );
  const [signedDocUrls, setSignedDocUrls] = useState<Record<string, string>>({});
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);

  // Status log ("מעקב הפנייה") — a running, dated history of updates instead
  // of the single status_note field silently overwriting itself. Picking a
  // tag also drives the yellow "ממתין לניירת" coloring on the /referrals list.
  const [statusUpdates, setStatusUpdates] = useState<ReferralStatusUpdateRow[]>(initialStatusUpdates);
  const [updateTag, setUpdateTag] = useState<ReferralStatusTag | ''>('');
  const [updateNote, setUpdateNote] = useState('');
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    const paths = documents.map((d) => d.file_path);
    if (paths.length === 0) return;
    (async () => {
      const { getSignedFileUrls } = await import('@/app/actions/documents');
      const urls = await getSignedFileUrls('referral-documents', paths);
      setSignedDocUrls(urls);
    })();
  }, [documents]);

  async function saveField(field: keyof typeof fields, value: string) {
    setFields((f) => ({ ...f, [field]: value }));
    setSaveError(null);
    const patch =
      field === 'vehicle_year'
        ? { vehicle_year: value ? parseInt(value, 10) : null }
        : { [field]: value || null };
    const res = await updateReferral(referral.id, patch);
    if (res?.error) setSaveError(res.error);
    router.refresh();
  }

  async function savePlate(value: string) {
    setFields((f) => ({ ...f, plate_number: value }));
    setSaveError(null);
    const patch: Record<string, unknown> = { plate_number: value || null };

    const digits = value.replace(/\D/g, '');
    if (digits) {
      setVehicleLookupState('loading');
      const lookup = await lookupVehicleByPlate(value);
      if (!lookup.error && (lookup.vehicle_type || lookup.vehicle_year)) {
        if (lookup.vehicle_type) {
          patch.vehicle_type = lookup.vehicle_type;
          setFields((f) => ({ ...f, vehicle_type: lookup.vehicle_type! }));
        }
        if (lookup.vehicle_year) {
          patch.vehicle_year = lookup.vehicle_year;
          setFields((f) => ({ ...f, vehicle_year: String(lookup.vehicle_year) }));
        }
        setVehicleLookupState('found');
      } else {
        setVehicleLookupState('not-found');
      }
    } else {
      setVehicleLookupState('idle');
    }

    const res = await updateReferral(referral.id, patch);
    if (res?.error) setSaveError(res.error);
    router.refresh();
  }

  async function saveFollowUpDate(value: string) {
    setFields((f) => ({ ...f, follow_up_date: value }));
    setSaveError(null);
    const res = await setReferralFollowUpDate(referral.id, value || null);
    if (res?.error) setSaveError(res.error);
    router.refresh();
  }

  async function handleCancel() {
    setCancelling(true);
    const res = await cancelReferral(referral.id);
    setCancelling(false);
    if (res?.error) {
      setSaveError(res.error);
      return;
    }
    router.push('/referrals');
    router.refresh();
  }

  async function handleUploadFiles(files: File[]) {
    setUploadingDocument(true);
    setDocumentError(null);
    for (const file of files) {
      const fd = new FormData();
      fd.append('referral_id', referral.id);
      fd.append('file', file);
      const res = await uploadReferralDocument(fd);
      if (res?.error) {
        setDocumentError(res.error);
      }
    }
    router.refresh();
    // Re-read the fresh document list from the server via a full page data
    // refresh isn't wired here (this is a client component owning its own
    // list) — reload straight from the DB instead so the grid reflects the
    // upload immediately.
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data } = await supabase
      .from('referral_documents')
      .select('id, file_name, file_path, file_size, mime_type, created_at')
      .eq('referral_id', referral.id)
      .order('created_at', { ascending: false });
    if (data) setDocuments(data as CaseDocument[]);
    setUploadingDocument(false);
  }

  async function handleDeleteDocument(docId: string) {
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    const res = await deleteReferralDocument(docId);
    if (res?.error) setDocumentError(res.error);
    router.refresh();
  }

  async function handleCaseCreated(caseId: string) {
    await convertReferral(referral.id, caseId);
    router.push(`/cases/${caseId}`);
    router.refresh();
  }

  async function handleAddStatusUpdate() {
    if (!updateTag && !updateNote.trim()) {
      setUpdateError('נדרש מצב או הערה');
      return;
    }
    setSavingUpdate(true);
    setUpdateError(null);
    const res = await addReferralStatusUpdate(referral.id, updateTag || null, updateNote);
    setSavingUpdate(false);
    if (res?.error) {
      setUpdateError(res.error);
      return;
    }
    setUpdateTag('');
    setUpdateNote('');
    // Re-read straight from the DB, same reasoning as documents above — this
    // client component owns its own list, router.refresh() alone wouldn't
    // update it.
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data } = await supabase
      .from('referral_status_updates')
      .select('id, status_tag, note, created_at, profiles(full_name)')
      .eq('referral_id', referral.id)
      .order('created_at', { ascending: false });
    if (data) setStatusUpdates(data as unknown as ReferralStatusUpdateRow[]);
    router.refresh();
  }

  const daysWaiting = Math.floor((Date.now() - new Date(referral.created_at).getTime()) / 86400000);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/referrals" className="text-sm text-stone-500 hover:text-stone-700 flex items-center gap-1">
            <span>←</span> חזרה להפניות
          </Link>
          <h1 className="text-2xl font-bold text-stone-900 mt-1">
            {referral.customer_name ?? 'הפנייה'}
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">
            ⏱ {daysWaiting} ימים מקבלת ההפנייה · {branchName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CreateCaseButton
            branchId={referral.branch_id}
            isCeo={false /* deliberate: the case inherits the referral's own branch, no re-picking */}
            triggerLabel="צור תיק מהפנייה"
            onCreated={handleCaseCreated}
            initialValues={{
              plate_number: fields.plate_number,
              vehicle_type: fields.vehicle_type,
              vehicle_year: fields.vehicle_year,
              customer_name: fields.customer_name,
              phone: fields.phone,
              insurance_company: fields.insurance_company,
              appraiser_name: fields.appraiser_name,
              branch_id: referral.branch_id,
            }}
          />
          {cancelConfirm ? (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <span className="text-sm text-red-700">לבטל הפנייה זו?</span>
              <button type="button" disabled={cancelling} onClick={() => void handleCancel()} className="text-sm font-semibold text-red-700 hover:text-red-900">
                {cancelling ? '...' : 'כן, בטל'}
              </button>
              <button type="button" onClick={() => setCancelConfirm(false)} className="text-sm text-gray-500 hover:text-gray-700">ביטול</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCancelConfirm(true)}
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              🗑 הפנייה בוטלה
            </button>
          )}
        </div>
      </div>

      {saveError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {saveError}</div>
      )}

      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3 sm:p-6">
        <h2 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
          <span className="text-2xl">📋</span>
          פרטי הפנייה
          <span className="text-xs font-normal text-gray-400 mr-1">(לחץ על ערך לעריכה)</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <Field label="שם לקוח" value={fields.customer_name} onSave={(v) => void saveField('customer_name', v)} />
          <Field label="טלפון" value={fields.phone} onSave={(v) => void saveField('phone', v)} dir="ltr" />
          <Field label="מספר רכב" value={fields.plate_number} onSave={(v) => void savePlate(v)} dir="ltr" />
          <div>
            <Field label="סוג רכב" value={fields.vehicle_type} onSave={(v) => void saveField('vehicle_type', v)} />
            {vehicleLookupState === 'loading' && (
              <p className="text-xs text-gray-400 mr-[7.5rem] -mt-1">מאתר במשרד התחבורה...</p>
            )}
            {vehicleLookupState === 'not-found' && (
              <p className="text-xs text-amber-600 mr-[7.5rem] -mt-1">לא נמצא ברשימת משרד התחבורה</p>
            )}
          </div>
          <Field label="שנת רכב" value={fields.vehicle_year} onSave={(v) => void saveField('vehicle_year', v)} dir="ltr" />
          <Field label="חברת ביטוח" value={fields.insurance_company} onSave={(v) => void saveField('insurance_company', v)} />
          <Field label="סוג תביעה" value={fields.claim_type} onSave={(v) => void saveField('claim_type', v)} />
          <Field label="שמאי" value={fields.appraiser_name} onSave={(v) => void saveField('appraiser_name', v)} />
          <div className="flex items-center gap-2 py-1.5">
            <span className="text-gray-500 font-medium min-w-[7.5rem] flex-shrink-0">תזכורת מעקב:</span>
            <input
              type="date"
              value={fields.follow_up_date}
              onChange={(e) => setFields((f) => ({ ...f, follow_up_date: e.target.value }))}
              onBlur={() => { if (fields.follow_up_date !== (referral.follow_up_date ?? '')) void saveFollowUpDate(fields.follow_up_date); }}
              className="flex-1 border border-transparent hover:border-gray-200 focus:border-blue-400 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-400 transition-colors"
              dir="ltr"
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          תזכורת מעקב תשלח התראה במשרד/מנכ"ל ביום שנקבע — לדוגמה "לקוח תואם לשבוע הבא"
        </p>
        <div className="mt-4 pt-4 border-t border-gray-100">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">סטטוס הפנייה (טקסט חופשי)</label>
          <textarea
            value={fields.status_note}
            onChange={(e) => setFields((f) => ({ ...f, status_note: e.target.value }))}
            onBlur={() => void saveField('status_note', fields.status_note)}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-brand-red outline-none"
            placeholder="לדוגמה: ממתין לתיאום עם הלקוח"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3 sm:p-6">
        <h2 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
          <span className="text-2xl">🕒</span>
          מעקב הפנייה
        </h2>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <select
            value={updateTag}
            onChange={(e) => setUpdateTag(e.target.value as ReferralStatusTag | '')}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-brand-red outline-none sm:w-56"
          >
            <option value="">ללא שינוי מצב</option>
            {(Object.keys(STATUS_TAG_LABELS) as ReferralStatusTag[]).map((tag) => (
              <option key={tag} value={tag}>{STATUS_TAG_LABELS[tag]}</option>
            ))}
          </select>
          <input
            type="text"
            value={updateNote}
            onChange={(e) => setUpdateNote(e.target.value)}
            placeholder="לדוגמה: לקוח ממתין לרכב חלופי, יחזור אלינו בסוף השבוע"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-brand-red outline-none"
          />
          <button
            type="button"
            disabled={savingUpdate}
            onClick={() => void handleAddStatusUpdate()}
            className="px-4 py-2 bg-brand-red hover:bg-brand-red-dark text-white rounded-lg text-sm font-semibold disabled:opacity-50 shrink-0"
          >
            {savingUpdate ? '...' : 'שמור עדכון'}
          </button>
        </div>

        {updateError && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">⚠️ {updateError}</div>
        )}

        {statusUpdates.length === 0 ? (
          <p className="text-sm text-gray-400">אין עדיין עדכוני מעקב</p>
        ) : (
          <ul className="space-y-2">
            {statusUpdates.map((u) => {
              const author = Array.isArray(u.profiles) ? u.profiles[0] : u.profiles;
              return (
                <li key={u.id} className="flex items-start gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                  <span className="text-lg shrink-0">📝</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {u.status_tag && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          u.status_tag === 'AWAITING_PAPERWORK' ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-700'
                        }`}>
                          {STATUS_TAG_LABELS[u.status_tag]}
                        </span>
                      )}
                      <span className="text-[11px] text-gray-400">
                        {new Date(u.created_at).toLocaleString('he-IL')}
                        {author?.full_name ? ` · ${author.full_name}` : ''}
                      </span>
                    </div>
                    {u.note && <p className="text-sm text-gray-800 mt-0.5">{u.note}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <DocumentsSection
        documents={documents}
        signedDocUrls={signedDocUrls}
        canEdit={true}
        documentError={documentError}
        uploadingDocument={uploadingDocument}
        onUploadFiles={handleUploadFiles}
        onDeleteDocument={handleDeleteDocument}
      />
    </div>
  );
}
