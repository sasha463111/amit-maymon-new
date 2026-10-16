'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { updatePainterChecklist, createPainterRequest, updatePainterRequestStatus, setPainterFinished, confirmPartsReceived } from '@/app/actions/painter';
import { uploadCaseDocument } from '@/app/actions/documents';
import { LicensePlate } from '@/components/ui/LicensePlate';
import { formatDate } from '@/lib/dates';
import { CaseNotesComposer } from '@/components/CaseNotesComposer';
import { shrinkImage } from '@/lib/shrinkImage';
import { CameraBatchUpload } from '@/components/CameraBatchUpload';
import { PainterStatusPicker } from './PainterStatusPicker';
import { toast } from '@/components/Toaster';

type PainterRequest = {
  id: string;
  description: string;
  request_type: string;
  status: string;
  response_note?: string | null;
  created_at: string;
  image_urls?: string[];
  /** PARTS request: the painter confirmed the extra parts reached him (Amit, 14/10). */
  received_at?: string | null;
};

const REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: 'ממתין',
  IN_PROGRESS: 'בטיפול',
  DONE: 'טופל',
  REJECTED: 'נדחה',
};
const REQUEST_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  DONE: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

function formatCheckedAt(iso: string): string {
  const d = new Date(iso);
  const date = formatDate(d);
  const time = d.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
  return `סומן ב-${date}, ${time}`;
}

interface Props {
  caseId: string;
  caseKey: string | null;
  customerName: string | null;
  phone: string | null;
  /** Pixcar photos link of the case (cases.fixcar_link) — painters view it too (Amit, 2026-10-13). */
  fixcarLink: string | null;
  painterStatus: string | null;
  painterStatusOtherText: string | null;
  partsArrived: boolean;
  enteredWorkAt: string | null;
  /** "סיום עבודה" — set: the case is off the painters board. */
  finishedAt: string | null;
  partsArrivedAt: string | null;
  enterWorkCompletedAt: string | null;
  enterWorkCompletedByName: string | null;
  openedAt: string | null;
  licensePlate: string | null;
  carMake: string | null;
  /** Ministry lookup, e.g. "קיה ד. קוריאה STONIC" — what the painters board shows. */
  carVehicleType: string | null;
  carModel: string | null;
  carYear: number | null;
  branchName: string | null;
  /** "יועץ מטפל" — whom to ask (src/lib/caseAdvisors.ts). */
  advisors: string[];
  role: string;
  initialRequests: PainterRequest[];
}

function PainterRequestItem({
  req,
  canManage,
  canConfirmReceipt,
  isHighlighted,
  onStatusUpdate,
}: {
  req: PainterRequest;
  canManage: boolean;
  /** Painter / CEO / SM: tick "קיבלתי את תוספת החלקים". */
  canConfirmReceipt: boolean;
  isHighlighted?: boolean;
  onStatusUpdate: (newStatus: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receivedAt, setReceivedAt] = useState<string | null>(req.received_at ?? null);

  async function toggleReceived(next: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const prev = receivedAt;
    setReceivedAt(next ? new Date().toISOString() : null); // optimistic
    const res = await confirmPartsReceived(req.id, next);
    if (res?.error) {
      setError(res.error);
      setReceivedAt(prev);
    }
    setBusy(false);
  }

  async function setStatus(next: 'PENDING' | 'IN_PROGRESS' | 'DONE') {
    if (busy) return;
    setBusy(true);
    setError(null);
    const prevStatus = req.status;
    onStatusUpdate(next); // optimistic
    const res = await updatePainterRequestStatus(req.id, next);
    if (res?.error) {
      setError(res.error);
      onStatusUpdate(prevStatus); // revert
    }
    setBusy(false);
  }

  return (
    <div
      id={`painter-request-${req.id}`}
      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
        isHighlighted ? 'bg-amber-50 border-amber-300 ring-2 ring-brand-red ring-offset-2' : 'bg-gray-50 border-gray-100'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-medium text-gray-500 bg-gray-200 rounded px-2 py-0.5">
            {req.request_type === 'WORK' ? 'עבודה' : 'חלקים'}
          </span>
          <span className={`text-xs font-medium rounded px-2 py-0.5 ${REQUEST_STATUS_COLORS[req.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {REQUEST_STATUS_LABELS[req.status] ?? req.status}
          </span>
          <span className="text-xs text-gray-400">
            {formatDate(req.created_at)}
          </span>
        </div>
        <p className="text-sm text-gray-700 break-words">{req.description}</p>
        {req.response_note && (
          <p className="text-xs text-gray-500 mt-1">💬 {req.response_note}</p>
        )}
        {(req.image_urls?.length ?? 0) > 0 && (
          <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-2">
            {req.image_urls!.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square rounded-md overflow-hidden border border-gray-200 bg-white hover:opacity-90 transition-opacity"
              >
                <img
                  src={url}
                  alt={`תמונה ${i + 1} מהבקשה`}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </a>
            ))}
          </div>
        )}
        {/* Extra parts supplied → the painter confirms they reached him (Amit, 14/10). */}
        {req.request_type === 'PARTS' && req.status === 'DONE' && (
          <div className={`mt-2 rounded-lg border p-2 ${receivedAt ? 'border-green-200 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
            {canConfirmReceipt ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!receivedAt}
                  disabled={busy}
                  onChange={(e) => void toggleReceived(e.target.checked)}
                  className="w-6 h-6 rounded border-2 border-gray-400 accent-green-600 cursor-pointer shrink-0"
                />
                <span className={`text-sm font-semibold ${receivedAt ? 'text-green-800' : 'text-amber-900'}`}>
                  {receivedAt ? '✓ תוספת החלקים התקבלה' : 'קיבלתי את תוספת החלקים'}
                </span>
              </label>
            ) : (
              <span className={`text-sm font-semibold ${receivedAt ? 'text-green-800' : 'text-amber-900'}`}>
                {receivedAt ? '✓ הפחח אישר שתוספת החלקים התקבלה' : '⏳ ממתין לאישור הפחח שתוספת החלקים התקבלה'}
              </span>
            )}
            {receivedAt && <p className="text-[11px] text-green-700 mt-0.5">{formatCheckedAt(receivedAt)}</p>}
          </div>
        )}
        {canManage && req.status !== 'DONE' && (
          <div className="mt-2 flex flex-wrap gap-2">
            {req.status === 'PENDING' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void setStatus('IN_PROGRESS')}
                className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs font-semibold disabled:opacity-50"
              >
                לקח בטיפול
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void setStatus('DONE')}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-semibold disabled:opacity-50"
            >
              ✓ בוצע — הודע לפחח
            </button>
          </div>
        )}
        {canManage && req.status === 'DONE' && (
          <div className="mt-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void setStatus('PENDING')}
              className="text-xs text-gray-500 underline hover:text-gray-700 disabled:opacity-50"
            >
              החזר לטיפול
            </button>
          </div>
        )}
        {error && <p className="text-xs text-red-600 mt-1">⚠️ {error}</p>}
      </div>
    </div>
  );
}

export function PainterCaseClient({
  caseId,
  caseKey,
  customerName,
  phone,
  fixcarLink,
  painterStatus,
  painterStatusOtherText,
  partsArrived,
  enteredWorkAt,
  finishedAt,
  partsArrivedAt,
  enterWorkCompletedAt,
  enterWorkCompletedByName,
  openedAt,
  licensePlate,
  carMake,
  carVehicleType,
  carModel,
  carYear,
  branchName,
  advisors,
  role,
  initialRequests,
}: Props) {
  const router = useRouter();
  // Arriving from a painter-request notification (?highlight=<request id>)
  // scrolls to and highlights that specific request instead of just landing
  // generically on the page — same pattern as approvals' ?highlight.
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('highlight');
  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(`painter-request-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Checklist state (optimistic)
  const [enteredWork, setEnteredWork] = useState(
    painterStatus === 'IN_WORK' || painterStatus === 'PARTS_ARRIVED' || painterStatus === 'READY_FOR_RELEASE'
  );
  const [partsArrivedLocal, setPartsArrivedLocal] = useState(partsArrived);
  const [enteredWorkAtLocal, setEnteredWorkAtLocal] = useState(enteredWorkAt);
  const [partsArrivedAtLocal, setPartsArrivedAtLocal] = useState(partsArrivedAt);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistError, setChecklistError] = useState<string | null>(null);

  // Document upload (multi-file) — attach documentation for this case
  // directly from the painter's own view.
  const [docsUploading, setDocsUploading] = useState(false);
  const [docsUploadError, setDocsUploadError] = useState<string | null>(null);
  const [docsUploadedCount, setDocsUploadedCount] = useState(0);

  async function uploadCaseDocs(files: File[]) {
    if (files.length === 0) return;
    setDocsUploadError(null);
    setDocsUploading(true);
    const results = await Promise.all(
      files.map(async (file) => {
        const formData = new FormData();
        formData.append('case_id', caseId);
        formData.append('file', await shrinkImage(file));
        return uploadCaseDocument(formData);
      })
    );
    const errors = results.filter((r) => r?.error).map((r) => r!.error as string);
    const succeeded = results.length - errors.length;
    if (succeeded > 0) setDocsUploadedCount((c) => c + succeeded);
    if (errors.length > 0) {
      setDocsUploadError(
        errors.length === results.length
          ? errors[0]
          : `${succeeded}/${results.length} קבצים הועלו בהצלחה. שגיאה: ${errors[0]}`
      );
    }
    setDocsUploading(false);
  }

  // Requests
  const [requests, setRequests] = useState<PainterRequest[]>(initialRequests);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestType, setRequestType] = useState<'WORK' | 'PARTS'>('WORK');
  const [requestDesc, setRequestDesc] = useState('');
  const [requestImages, setRequestImages] = useState<File[]>([]);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const canEdit = role === 'PAINTER' || role === 'SERVICE_MANAGER' || role === 'CEO';
  const canFinish = canEdit || role === 'SERVICE_ADVISOR';
  const [finishedAtLocal, setFinishedAtLocal] = useState(finishedAt);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  async function handleFinish(finished: boolean) {
    // 16/10 (UI round): no confirm() — it acts at once and the toast offers
    // "ביטול" for 8 seconds (it is fully reversible: "↩️ החזר ללוח").
    setFinishing(true);
    setFinishError(null);
    const res = await setPainterFinished(caseId, finished);
    setFinishing(false);
    if ('error' in res && res.error) {
      setFinishError(res.error);
      return;
    }
    setFinishedAtLocal(finished && 'at' in res ? res.at ?? null : null);
    if (finished) {
      const label = licensePlate ?? caseKey ?? 'הרכב';
      toast(`✅ ${label} — העבודה הסתיימה, ירד מלוח הפחחים`, {
        undo: async () => {
          const back = await setPainterFinished(caseId, false);
          if ('error' in back && back.error) toast(`⚠️ ${back.error}`, { tone: 'error' });
          else {
            toast(`↩️ ${label} חזר ללוח הפחחים`);
            router.refresh();
          }
        },
      });
      router.push('/painters');
    }
  }

  async function handleChecklistChange(field: 'enteredWork' | 'partsArrived', value: boolean) {
    setChecklistError(null);
    setChecklistLoading(true);

    const prev = {
      enteredWork, partsArrived: partsArrivedLocal,
      enteredWorkAt: enteredWorkAtLocal, partsArrivedAt: partsArrivedAtLocal,
    };
    const optimisticAt = value ? new Date().toISOString() : null;
    if (field === 'enteredWork') {
      setEnteredWork(value);
      setEnteredWorkAtLocal(optimisticAt);
    } else {
      setPartsArrivedLocal(value);
      setPartsArrivedAtLocal(optimisticAt);
    }

    const updates =
      field === 'enteredWork'
        ? { painter_entered_work: value }
        : { parts_arrived: value };

    const res = await updatePainterChecklist(caseId, updates);
    if (res?.error) {
      setChecklistError(res.error);
      // Revert
      if (field === 'enteredWork') {
        setEnteredWork(prev.enteredWork);
        setEnteredWorkAtLocal(prev.enteredWorkAt);
      } else {
        setPartsArrivedLocal(prev.partsArrived);
        setPartsArrivedAtLocal(prev.partsArrivedAt);
      }
    } else if (res?.at) {
      // Sync to the server-computed timestamp so it matches what's persisted.
      if (field === 'enteredWork' && value) setEnteredWorkAtLocal(res.at);
      else if (field === 'partsArrived' && value) setPartsArrivedAtLocal(res.at);
    }
    setChecklistLoading(false);
  }

  async function handleSubmitRequest() {
    if (!requestDesc.trim()) {
      setRequestError('נדרש תיאור');
      return;
    }
    setRequestError(null);
    setRequestLoading(true);

    try {
      let formData: FormData | undefined;
      if (requestImages.length > 0) {
        formData = new FormData();
        for (const f of requestImages) formData.append('images', await shrinkImage(f, { maxSide: 1600 }));
      }

      const res = await createPainterRequest(caseId, requestDesc, requestType, formData);
      if (res?.error) {
        setRequestError(res.error);
        return;
      }

      // Optimistic: add to list
      setRequests((prev) => [
        {
          id: res.requestId ?? Date.now().toString(),
          description: requestDesc,
          request_type: requestType,
          status: 'PENDING',
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setRequestDesc('');
      setRequestImages([]);
      setShowRequestForm(false);
      router.refresh();
    } finally {
      setRequestLoading(false);
    }
  }

  // Phone action bar (16/10, UI round): the painter's three everyday actions
  // stay at his thumb above the bottom tabs — no scrolling to find them.
  // 📷 opens the same multi-shot camera as the header (its tray shows there).
  const showActionBar = canEdit || (canFinish && !finishedAtLocal);
  function openCamera() {
    const box = document.getElementById('painter-docs');
    box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    box?.querySelector<HTMLInputElement>('input[capture]')?.click();
  }
  function openRequest() {
    setShowRequestForm(true);
    requestAnimationFrame(() => document.getElementById('painter-requests')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  // Case creation fills only vehicle_type (make/model are almost always
  // empty) — show it, like the painters board does (Amit, 2026-10-12).
  const carLabel = [carVehicleType?.trim() || [carMake, carModel].filter(Boolean).join(' '), carYear].filter(Boolean).join(' · ');

  return (
    <div className={`space-y-6 max-w-2xl mx-auto ${showActionBar ? 'pb-20 md:pb-0' : ''}`} dir="rtl">
      {/* Question / note to chosen people (Amit, 2026-10-08) */}
      <CaseNotesComposer caseId={caseId} collapsible />

      {/* Back navigation */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link href="/painters" className="text-sm text-blue-600 hover:underline">← חזרה ללוח פחחים</Link>
        {(role === 'SERVICE_MANAGER' || role === 'CEO') && (
          <a
            href={`/cases/${caseId}`}
            className="text-sm bg-brand-red hover:bg-brand-red-dark text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            פתח תיק מלא →
          </a>
        )}
      </div>

      {/* Case Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            {licensePlate ? (
              <LicensePlate plate={licensePlate} size="lg" />
            ) : (
              <h1 className="text-2xl font-bold text-gray-800" dir="ltr">{caseKey ?? '—'}</h1>
            )}
            {customerName && (
              <p className="text-base font-semibold text-gray-700 mt-1">{customerName}</p>
            )}
            {carLabel && <p className="text-gray-500 text-sm mt-0.5">{carLabel}</p>}
          </div>
          {/* Status dropdown for the painter (Amit, 2026-10-14). */}
          <PainterStatusPicker caseId={caseId} status={painterStatus} otherText={painterStatusOtherText} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2">
            <p className="text-xs text-indigo-500 mb-0.5">יועץ מטפל — למי לפנות</p>
            <p className="font-bold text-indigo-800">{advisors.length ? advisors.join(', ') : 'טרם שויך'}</p>
          </div>
          {customerName && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">שם לקוח</p>
              <p className="font-medium text-gray-700">{customerName}</p>
            </div>
          )}
          {phone && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">טלפון</p>
              <a href={`tel:${phone}`} className="font-medium text-blue-600 hover:underline">{phone}</a>
            </div>
          )}
          {branchName && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">סניף</p>
              <p className="font-medium text-gray-700">{branchName}</p>
            </div>
          )}
          {openedAt && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">תאריך פתיחה</p>
              <p className="font-medium text-gray-700">{formatDate(openedAt)}</p>
            </div>
          )}
        </div>

        {/* Pixcar photos of the car (Amit, 2026-10-13) — opens in a new tab. */}
        {fixcarLink && /^https?:\/\//i.test(fixcarLink.trim()) && (
          <a
            href={fixcarLink.trim()}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700"
          >
            📸 צפייה בתמונות Pixcar
          </a>
        )}

        {/* Who marked the case as entered work + when — the action that just
            triggered the notification, so it's not just "a car is ready"
            with no context of who to ask if something's unclear. */}
        {enterWorkCompletedAt && (
          <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
            🔧 סומן &quot;נכנס לעבודה&quot; ע&quot;י{' '}
            <span className="font-semibold text-gray-700">{enterWorkCompletedByName ?? 'לא ידוע'}</span>
            {' · '}
            {formatDate(enterWorkCompletedAt)},{' '}
            {new Date(enterWorkCompletedAt).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' })}
          </div>
        )}

        {/* Attach documentation for this case (multi-file, same pattern as
            the case detail and closure screens) */}
        <div id="painter-docs" className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap scroll-mt-24">
          <label className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors ${docsUploading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}>
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              disabled={docsUploading}
              onChange={async (e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;
                await uploadCaseDocs(Array.from(files));
                e.target.value = '';
              }}
            />
            📁 {docsUploading ? 'מעלה...' : 'הוסף מסמך'}
          </label>
          {/* Several shots, then one upload (Amit, 2026-10-13). */}
          <CameraBatchUpload
            onUpload={async (files) => { await uploadCaseDocs(files); }}
            disabled={docsUploading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
          />
          {docsUploadedCount > 0 && !docsUploadError && (
            <span className="text-xs text-green-600">✓ הועלו {docsUploadedCount} קבצים</span>
          )}
          {docsUploadError && <span className="text-xs text-red-600">⚠️ {docsUploadError}</span>}
        </div>
      </div>

      {/* Painter Checklist */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-lg font-bold text-gray-800 mb-4">צ&apos;קליסט פחח</h2>
        {checklistError && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{checklistError}</div>
        )}
        <div className="space-y-3">
          {/* נכנס לעבודה */}
          <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
            enteredWork ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
          }`}>
            <input
              type="checkbox"
              checked={enteredWork}
              disabled={checklistLoading || !canEdit}
              onChange={(e) => void handleChecklistChange('enteredWork', e.target.checked)}
              className="w-5 h-5 accent-green-600"
            />
            <div className="flex-1">
              <p className="font-medium text-gray-800">נכנס לעבודה</p>
              {enteredWork && enteredWorkAtLocal ? (
                <p className="text-xs text-green-700">{formatCheckedAt(enteredWorkAtLocal)}</p>
              ) : (
                <p className="text-xs text-gray-500">סמן כשהרכב נכנס לעבודה פעילה</p>
              )}
            </div>
            {enteredWork && <span className="text-green-600 font-bold text-lg">✓</span>}
          </label>

          {/* התקבל חלקים */}
          <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
            partsArrivedLocal ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
          }`}>
            <input
              type="checkbox"
              checked={partsArrivedLocal}
              disabled={checklistLoading || !canEdit}
              onChange={(e) => void handleChecklistChange('partsArrived', e.target.checked)}
              className="w-5 h-5 accent-green-600"
            />
            <div className="flex-1">
              <p className="font-medium text-gray-800">התקבל חלקים</p>
              {partsArrivedLocal && partsArrivedAtLocal ? (
                <p className="text-xs text-green-700">{formatCheckedAt(partsArrivedAtLocal)}</p>
              ) : (
                <p className="text-xs text-gray-500">סמן כשהחלקים הגיעו למוסך</p>
              )}
            </div>
            {partsArrivedLocal && <span className="text-green-600 font-bold text-lg">✓</span>}
          </label>

          {/* סיום עבודה — off the painters board only (Amit, 2026-10-12) */}
          {finishedAtLocal ? (
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-green-50 border-green-300">
              <div className="flex-1">
                <p className="font-bold text-green-800">✅ העבודה הסתיימה</p>
                <p className="text-xs text-green-700">{formatCheckedAt(finishedAtLocal)} · הרכב ירד מלוח הפחחים</p>
              </div>
              {canFinish && (
                <button type="button" disabled={finishing} onClick={() => void handleFinish(false)} className="text-xs text-gray-600 underline disabled:opacity-50">
                  ↩️ החזר ללוח
                </button>
              )}
            </div>
          ) : (
            canFinish && (
              <button
                type="button"
                disabled={finishing}
                onClick={() => void handleFinish(true)}
                data-tip="painter-finish"
                className="w-full p-4 rounded-lg bg-green-600 text-white font-bold text-base hover:bg-green-700 disabled:opacity-50"
              >
                {finishing ? 'שומר…' : '✅ סיום עבודה'}
                <span className="block text-xs font-normal opacity-90">הרכב ירד מלוח הפחחים וימשיך בתיקים עד הסגירה</span>
              </button>
            )
          )}
          {finishError && <p className="text-xs text-red-600">⚠️ {finishError}</p>}
        </div>
      </div>

      {/* Painter Requests */}
      <div id="painter-requests" className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 scroll-mt-24">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">בקשות לפחח</h2>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowRequestForm((v) => !v)}
              data-tip="painter-request"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              {showRequestForm ? '✕ סגור' : '+ בקשה חדשה'}
            </button>
          )}
        </div>

        {/* New request form */}
        {showRequestForm && (
          <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-3">
            <p className="text-sm font-semibold text-blue-700">בקשה חדשה — תישלח ליועצי הפחחות</p>

            {/* Request type */}
            <div className="flex gap-2">
              {(['WORK', 'PARTS'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRequestType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    requestType === t
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {t === 'WORK' ? 'עבודה' : 'חלקים'}
                </button>
              ))}
            </div>

            {/* Description */}
            <textarea
              value={requestDesc}
              onChange={(e) => setRequestDesc(e.target.value)}
              placeholder="תאר את הבקשה..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />

            {/* Images */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">תמונות (אופציונלי)</label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white border border-gray-300 rounded-md text-xs font-medium cursor-pointer hover:bg-gray-50">
                  📁 בחר תמונות
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setRequestImages((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
                    className="hidden"
                  />
                </label>
                <label className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-blue-50 border border-blue-300 text-blue-700 rounded-md text-xs font-medium cursor-pointer hover:bg-blue-100">
                  📷 צלם
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => setRequestImages((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
                    className="hidden"
                  />
                </label>
              </div>
              {requestImages.length > 0 && (
                <div className="mt-2 space-y-1">
                  {requestImages.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-blue-50 px-2 py-1 rounded">
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setRequestImages(requestImages.filter((_, idx) => idx !== i))}
                        className="text-gray-400 hover:text-red-600 ml-2 shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {requestError && (
              <p className="text-xs text-red-600">{requestError}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={requestLoading}
                onClick={() => void handleSubmitRequest()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {requestLoading ? '⏳ שולח...' : '📤 שלח בקשה ליועצים'}
              </button>
              <button
                type="button"
                onClick={() => { setShowRequestForm(false); setRequestDesc(''); setRequestImages([]); setRequestError(null); }}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                ביטול
              </button>
            </div>
          </div>
        )}

        {/* Requests list */}
        {requests.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">אין בקשות עדיין</p>
        ) : (
          <div className="space-y-2">
            {requests.map((req) => (
              <PainterRequestItem
                key={req.id}
                req={req}
                canManage={role === 'SERVICE_MANAGER' || role === 'CEO' || role === 'SERVICE_ADVISOR'}
                canConfirmReceipt={role === 'PAINTER' || role === 'CEO' || role === 'SERVICE_MANAGER'}
                isHighlighted={req.id === highlightId}
                onStatusUpdate={(newStatus) => {
                  setRequests((prev) =>
                    prev.map((r) => (r.id === req.id ? { ...r, status: newStatus } : r))
                  );
                }}
              />
            ))}
          </div>
        )}
      </div>

      {showActionBar && (
        <div
          className="md:hidden fixed inset-x-0 z-30 bottom-[calc(4rem+env(safe-area-inset-bottom))] bg-white/95 backdrop-blur border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] px-3 py-2"
          dir="rtl"
        >
          <div className={`grid gap-2 ${canEdit && canFinish && !finishedAtLocal ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {canEdit && (
              <button type="button" onClick={openCamera} disabled={docsUploading} className="h-12 rounded-xl border border-gray-300 bg-white text-sm font-bold text-gray-800 active:bg-gray-100 disabled:opacity-50">
                {docsUploading ? 'מעלה…' : '📷 צילום'}
              </button>
            )}
            {canEdit && (
              <button type="button" onClick={openRequest} className="h-12 rounded-xl border border-blue-300 bg-blue-50 text-sm font-bold text-blue-800 active:bg-blue-100">
                ✋ בקשה
              </button>
            )}
            {canFinish && !finishedAtLocal && (
              <button type="button" disabled={finishing} onClick={() => void handleFinish(true)} data-tip="painter-bar" className="h-12 rounded-xl bg-green-600 text-sm font-bold text-white active:bg-green-700 disabled:opacity-50">
                {finishing ? 'שומר…' : '✅ סיום עבודה'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
