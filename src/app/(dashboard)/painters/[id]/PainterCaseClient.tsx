'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updatePainterChecklist, createPainterRequest, updatePainterRequestStatus } from '@/app/actions/painter';
import { LicensePlate } from '@/components/ui/LicensePlate';

type PainterRequest = {
  id: string;
  description: string;
  request_type: string;
  status: string;
  created_at: string;
  image_urls?: string[];
};

const REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: 'ממתין',
  IN_PROGRESS: 'בטיפול',
  DONE: 'טופל',
};
const REQUEST_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  DONE: 'bg-green-100 text-green-800',
};

const PAINTER_STATUS_LABELS: Record<string, string> = {
  IN_WORK: 'בעבודה',
  WAITING_PARTS: 'ממתין לחלקים',
  PARTS_ARRIVED: 'הגיעו חלקים',
  READY_FOR_RELEASE: 'מוכן לשחרור',
};

interface Props {
  caseId: string;
  caseKey: string | null;
  customerName: string | null;
  phone: string | null;
  painterStatus: string | null;
  partsArrived: boolean;
  openedAt: string | null;
  licensePlate: string | null;
  carMake: string | null;
  carModel: string | null;
  carYear: number | null;
  branchName: string | null;
  role: string;
  initialRequests: PainterRequest[];
}

function PainterRequestItem({
  req,
  canManage,
  onStatusUpdate,
}: {
  req: PainterRequest;
  canManage: boolean;
  onStatusUpdate: (newStatus: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-medium text-gray-500 bg-gray-200 rounded px-2 py-0.5">
            {req.request_type === 'WORK' ? 'עבודה' : 'חלקים'}
          </span>
          <span className={`text-xs font-medium rounded px-2 py-0.5 ${REQUEST_STATUS_COLORS[req.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {REQUEST_STATUS_LABELS[req.status] ?? req.status}
          </span>
          <span className="text-xs text-gray-400">
            {new Date(req.created_at).toLocaleDateString('he-IL')}
          </span>
        </div>
        <p className="text-sm text-gray-700 break-words">{req.description}</p>
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
  painterStatus,
  partsArrived,
  openedAt,
  licensePlate,
  carMake,
  carModel,
  carYear,
  branchName,
  role,
  initialRequests,
}: Props) {
  const router = useRouter();

  // Checklist state (optimistic)
  const [enteredWork, setEnteredWork] = useState(
    painterStatus === 'IN_WORK' || painterStatus === 'PARTS_ARRIVED' || painterStatus === 'READY_FOR_RELEASE'
  );
  const [partsArrivedLocal, setPartsArrivedLocal] = useState(partsArrived);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistError, setChecklistError] = useState<string | null>(null);

  // Requests
  const [requests, setRequests] = useState<PainterRequest[]>(initialRequests);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestType, setRequestType] = useState<'WORK' | 'PARTS'>('WORK');
  const [requestDesc, setRequestDesc] = useState('');
  const [requestImages, setRequestImages] = useState<File[]>([]);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const canEdit = role === 'PAINTER' || role === 'SERVICE_MANAGER' || role === 'CEO';

  async function handleChecklistChange(field: 'enteredWork' | 'partsArrived', value: boolean) {
    setChecklistError(null);
    setChecklistLoading(true);

    const prev = { enteredWork, partsArrived: partsArrivedLocal };
    if (field === 'enteredWork') setEnteredWork(value);
    else setPartsArrivedLocal(value);

    const updates =
      field === 'enteredWork'
        ? { painter_entered_work: value }
        : { parts_arrived: value };

    const res = await updatePainterChecklist(caseId, updates);
    if (res?.error) {
      setChecklistError(res.error);
      // Revert
      if (field === 'enteredWork') setEnteredWork(prev.enteredWork);
      else setPartsArrivedLocal(prev.partsArrived);
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
        requestImages.forEach((f) => formData!.append('images', f));
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

  const carLabel = [carMake, carModel, carYear].filter(Boolean).join(' ');

  return (
    <div className="space-y-6 max-w-2xl mx-auto" dir="rtl">
      {/* Back navigation */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <a href="/painters" className="text-sm text-blue-600 hover:underline">← חזרה ללוח פחחים</a>
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
          {painterStatus && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
              {PAINTER_STATUS_LABELS[painterStatus] ?? painterStatus}
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
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
              <p className="font-medium text-gray-700">{new Date(openedAt).toLocaleDateString('he-IL')}</p>
            </div>
          )}
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
              <p className="text-xs text-gray-500">סמן כשהרכב נכנס לעבודה פעילה</p>
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
              <p className="text-xs text-gray-500">סמן כשהחלקים הגיעו למוסך</p>
            </div>
            {partsArrivedLocal && <span className="text-green-600 font-bold text-lg">✓</span>}
          </label>
        </div>
      </div>

      {/* Painter Requests */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">בקשות לפחח</h2>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowRequestForm((v) => !v)}
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
                canManage={role === 'SERVICE_MANAGER' || role === 'CEO'}
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
    </div>
  );
}
