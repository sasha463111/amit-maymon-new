'use client';

/**
 * Shows painter requests (from `painter_requests` — created via the painter
 * board's "תוספת חדשה"/request flow) directly on the main case page. Real
 * gap this closes: these requests previously only appeared on /painters/[id]
 * — an advisor/manager working the case on /cases/[id] (their primary
 * screen) had no visibility into them at all unless they clicked through a
 * push notification.
 *
 * Clicking a request opens a dedicated modal to mark it done/rejected with a
 * manually-typed note, per the explicit request — not a bare status flip.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updatePainterRequestStatus } from '@/app/actions/painter';

export interface PainterRequestRow {
  id: string;
  description: string;
  request_type: string;
  status: string;
  response_note: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'ממתין', color: 'bg-yellow-100 text-yellow-800' },
  IN_PROGRESS: { label: 'בטיפול', color: 'bg-blue-100 text-blue-800' },
  DONE: { label: 'בוצע', color: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'נדחה', color: 'bg-red-100 text-red-800' },
};

const TYPE_LABEL: Record<string, string> = { WORK: 'עבודה', PARTS: 'חלקים' };

export function PainterRequestsSection({
  caseId,
  requests,
  canRespond,
}: {
  caseId: string;
  requests: PainterRequestRow[];
  canRespond: boolean;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (requests.length === 0) return null;

  const openReq = requests.find((r) => r.id === openId) ?? null;

  async function decide(status: 'DONE' | 'REJECTED') {
    if (!openReq) return;
    setBusy(true);
    setError(null);
    const res = await updatePainterRequestStatus(openReq.id, status, note);
    setBusy(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setOpenId(null);
    setNote('');
    router.refresh();
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3 sm:p-6">
      <h2 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
        <span className="text-2xl">🎨</span>
        בקשות פחח
      </h2>
      <ul className="space-y-2">
        {requests.map((r) => {
          const s = STATUS_LABELS[r.status] ?? { label: r.status, color: 'bg-gray-100 text-gray-700' };
          const isOpenStatus = r.status === 'PENDING' || r.status === 'IN_PROGRESS';
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => canRespond && isOpenStatus && (setOpenId(r.id), setNote(''), setError(null))}
                className={`w-full text-right flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  isOpenStatus ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'
                } ${canRespond && isOpenStatus ? 'hover:bg-amber-100 cursor-pointer' : 'cursor-default'}`}
              >
                <span className="text-lg shrink-0">{r.request_type === 'PARTS' ? '🔩' : '🔧'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-gray-500">{TYPE_LABEL[r.request_type] ?? r.request_type}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                  </div>
                  <p className="text-sm text-gray-800 mt-0.5">{r.description}</p>
                  {r.response_note && (
                    <p className="text-xs text-gray-500 mt-1">💬 {r.response_note}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">{new Date(r.created_at).toLocaleString('he-IL')}</p>
                </div>
                {canRespond && isOpenStatus && (
                  <span className="text-xs text-accent-text font-semibold shrink-0">להגיב ←</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {openReq && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          dir="rtl"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenId(null); }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-md w-full p-5 sm:p-6" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-1">מענה לבקשת פחח</h3>
            <p className="text-sm text-gray-600 mb-4">{openReq.description}</p>

            <label className="block text-sm font-medium text-gray-700 mb-1.5">הערה (אופציונלי)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-brand-red outline-none mb-4"
              placeholder="לדוגמה: הוזמן, יגיע מחר"
            />

            {error && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">⚠️ {error}</div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide('REJECTED')}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                ✕ נדחה
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide('DONE')}
                className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {busy ? '...' : '✓ בוצע'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
