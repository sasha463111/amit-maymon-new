'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { restoreWrittenOffCase, writeOffCase } from '@/app/actions/caseWriteOff';
import { formatDate } from '@/lib/dates';

/** "🚫 רכב לא לתיקון / מושבת" button (open case) — closes the case into the
 *  archive tab "מושבתים" (Amit, 2026-10-13). CEO only for now. */
export function WriteOffButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setErr(null);
    const res = await writeOffCase(caseId, reason);
    setBusy(false);
    if ('error' in res && res.error) return setErr(res.error);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 bg-stone-100 text-stone-700 border border-stone-300 rounded text-xs font-semibold hover:bg-stone-200"
      >
        🚫 רכב לא לתיקון / מושבת
      </button>
    );
  }
  return (
    <div className="w-full sm:w-auto flex flex-col gap-2 p-3 rounded-lg border border-stone-300 bg-stone-50">
      <p className="text-sm font-bold text-stone-800">לסגור את התיק כ&quot;מושבת&quot; (הרכב לא יתוקן)?</p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="סיבה (לא חובה) — למשל: טוטאל לוס, הלקוח לקח את הרכב"
        className="h-9 px-3 rounded border border-stone-300 text-sm"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirm()}
          className="px-3 py-1.5 bg-stone-800 text-white rounded text-xs font-semibold hover:bg-stone-900 disabled:opacity-50"
        >
          {busy ? 'סוגר…' : 'כן, סגור כמושבת'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-xs font-semibold">
          ביטול
        </button>
        {err && <span className="text-xs text-red-700">⚠️ {err}</span>}
      </div>
    </div>
  );
}

/** Shown on a written-off case: when, why, and (CEO) undo. */
export function WrittenOffBanner({
  caseId,
  writtenOffAt,
  reason,
  canRestore,
}: {
  caseId: string;
  writtenOffAt: string;
  reason: string | null;
  canRestore: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function restore() {
    if (!window.confirm('להחזיר את התיק לטיפול?')) return;
    setBusy(true);
    setErr(null);
    const res = await restoreWrittenOffCase(caseId);
    setBusy(false);
    if ('error' in res && res.error) return setErr(res.error);
    router.refresh();
  }

  return (
    <div className="rounded-xl border-2 border-stone-400 bg-stone-100 p-3 sm:p-4 flex flex-wrap items-center gap-3" dir="rtl">
      <div className="flex-1 min-w-0">
        <p className="font-bold text-stone-800">🚫 רכב מושבת — לא לתיקון</p>
        <p className="text-sm text-stone-600">
          נסגר {formatDate(writtenOffAt)}
          {reason ? ` · ${reason}` : ''}
        </p>
      </div>
      {canRestore && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void restore()}
          className="px-3 py-1.5 bg-white border border-stone-400 rounded text-xs font-semibold hover:bg-stone-50 disabled:opacity-50"
        >
          {busy ? 'מחזיר…' : '↩️ החזר לטיפול'}
        </button>
      )}
      {err && <span className="text-xs text-red-700 w-full">⚠️ {err}</span>}
    </div>
  );
}
