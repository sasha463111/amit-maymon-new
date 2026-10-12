'use client';

import { useEffect, useState } from 'react';
import { addClosureStatusUpdate, getClosureStatusUpdates, type ClosureStatusUpdate } from '@/app/actions/closureStatus';
import { formatDateTime } from '@/lib/dates';

/** "📝 סטטוס התיק" — manual updates during closure; the latest one is shown
 *  on the case card in the closure list (Amit, 2026-10-12). */
export function ClosureStatusSection({ caseId }: { caseId: string }) {
  const [updates, setUpdates] = useState<ClosureStatusUpdate[]>([]);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const res = await getClosureStatusUpdates(caseId);
    if (!res.error) setUpdates(res.data);
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function save() {
    setSaving(true);
    setErr(null);
    const res = await addClosureStatusUpdate(caseId, text);
    setSaving(false);
    if ('error' in res && res.error) {
      setErr(res.error);
      return;
    }
    setText('');
    await load();
  }

  return (
    <div className="bg-white rounded-xl shadow-md border-2 border-amber-200 p-3 sm:p-5" dir="rtl">
      <h2 className="text-lg font-bold mb-3 text-gray-800">📝 סטטוס התיק</h2>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim() && !saving) void save();
          }}
          maxLength={500}
          placeholder="לדוגמה: ממתין לחשבונית מהשמאי / הלקוח יגיע לחתום ביום ראשון"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-amber-400 outline-none"
        />
        <button
          type="button"
          disabled={saving || !text.trim()}
          onClick={() => void save()}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 shrink-0"
        >
          {saving ? '...' : 'שמור סטטוס'}
        </button>
      </div>
      {err && <p className="mb-2 text-sm text-red-700">⚠️ {err}</p>}
      {updates.length === 0 ? (
        <p className="text-sm text-gray-400">עוד אין עדכוני סטטוס. העדכון האחרון יופיע על כרטיס התיק ברשימת הסגירה.</p>
      ) : (
        <ul className="space-y-2">
          {updates.map((u, i) => (
            <li key={u.id} className={`p-2.5 rounded-lg border ${i === 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
              <p className={`text-sm ${i === 0 ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{u.note}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {formatDateTime(u.created_at)}
                {u.author ? ` · ${u.author}` : ''}
                {i === 0 ? ' · מוצג על הכרטיס' : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
