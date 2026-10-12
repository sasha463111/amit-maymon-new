'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestEstimateReapproval } from '@/app/actions/workflow';

/** The CEO rejected the estimate and nothing is waiting for approval now —
 *  "📤 שלח אומדן לאישור חוזר" opens a new request (Amit, 2026-10-12). Without
 *  it such cases had no way back: 8 open cases were stuck like that. */
export function EstimateRejectedBanner({
  caseId,
  approvals,
  role,
}: {
  caseId: string;
  approvals: { approval_type: string; status: string; rejection_note: string | null }[];
  role: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const est = approvals.filter((a) => a.approval_type === 'ESTIMATE_AND_DETAILS');
  const rejected = est.find((a) => a.status === 'REJECTED');
  const open = est.some((a) => a.status === 'PENDING' || a.status === 'APPROVED');
  if (!rejected || open) return null;
  const canSend = role === 'SERVICE_MANAGER' || role === 'SERVICE_ADVISOR' || role === 'CEO' || role === 'OFFICE';

  async function send() {
    setBusy(true);
    setMsg(null);
    const res = await requestEstimateReapproval(caseId);
    setBusy(false);
    if (res?.error) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setMsg({ ok: true, text: 'נשלח לאישור עמית ✓' });
    router.refresh();
  }

  return (
    <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 sm:p-4" dir="rtl">
      <p className="font-bold text-red-800">❌ האומדן נדחה על ידי המנכ&quot;ל</p>
      {rejected.rejection_note && <p className="text-sm text-red-700 mt-0.5">סיבה: {rejected.rejection_note}</p>}
      <div className="flex flex-wrap items-center gap-3 mt-2">
        {canSend && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void send()}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? 'שולח…' : '📤 שלח אומדן לאישור חוזר'}
          </button>
        )}
        <span className="text-xs text-red-700">תקנו קודם את מה שחסר (למשל העלו את קובץ האומדן), ואז שלחו.</span>
        {msg && <span className={`text-sm font-semibold ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.ok ? '' : '⚠️ '}{msg.text}</span>}
      </div>
    </div>
  );
}
