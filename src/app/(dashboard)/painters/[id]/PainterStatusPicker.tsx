'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCaseDetails } from '@/app/actions/caseDetails';
import { PAINTER_STATUS_LABELS } from '@/types/database';

/** The car's status, set by the painter from his own screen (Amit, 2026-10-14).
 *  Same field and server action as "סטטוס פחח" on the case page; "אחר" asks
 *  for free text. updateCaseDetails lets painters change only these fields. */
export function PainterStatusPicker({
  caseId,
  status,
  otherText,
}: {
  caseId: string;
  status: string | null;
  otherText: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status ?? '');
  const [text, setText] = useState(otherText ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(next: string) {
    const prev = value;
    setValue(next);
    setSaving(true);
    setErr(null);
    const res = await updateCaseDetails(caseId, {
      painter_status: next || null,
      ...(next !== 'OTHER' ? { painter_status_other_text: null } : {}),
    } as never);
    setSaving(false);
    if (res && 'error' in res && res.error) {
      setValue(prev);
      setErr(res.error);
      return;
    }
    if (next !== 'OTHER') setText('');
    router.refresh();
  }

  async function saveText() {
    setSaving(true);
    const res = await updateCaseDetails(caseId, { painter_status_other_text: text.trim() || null } as never);
    setSaving(false);
    if (res && 'error' in res && res.error) setErr(res.error);
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <select
        value={value}
        disabled={saving}
        onChange={(e) => void save(e.target.value)}
        className="rounded-full border border-blue-200 bg-blue-50 text-blue-800 text-xs font-bold px-3 py-1.5 outline-none disabled:opacity-60"
        aria-label="סטטוס הרכב"
      >
        <option value="">— סטטוס —</option>
        {Object.entries(PAINTER_STATUS_LABELS).map(([k, l]) => (
          <option key={k} value={k}>{l}</option>
        ))}
      </select>
      {value === 'OTHER' && (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void saveText()}
          placeholder="מה הסטטוס?"
          className="w-40 rounded-lg border border-gray-300 px-2 py-1 text-xs"
        />
      )}
      {err && <span className="text-[11px] text-red-700">⚠️ {err}</span>}
    </div>
  );
}
