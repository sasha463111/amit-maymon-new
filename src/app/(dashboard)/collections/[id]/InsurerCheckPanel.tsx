'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCollectionCase, type CollectionCase } from '@/app/actions/collections';
import { addCaseEvent, type CaseEvent } from '@/app/actions/collectionFile';
import { INSURER_CHECKS } from '@/lib/insurerCheck';
import { formatDate } from '@/lib/dates';

// "🔎 בדיקת ביטוח לרכב הפוגע" (Amit, 15/10, Discussion #3): every insurer's
// public check page in one list, the plate and date ready to paste, and the
// answer recorded in the case ("מבוטח כאן" also sets the third party's insurer).

const PREFIX = '🔎 בדיקת ביטוח';

export function InsurerCheckPanel({ c, events }: { c: CollectionCase; events: CaseEvent[] }) {
  const router = useRouter();
  const [plate, setPlate] = useState(c.tp_plate ?? '');
  const [date, setDate] = useState(c.event_date ?? '');
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const history = events.filter((e) => e.body.startsWith(PREFIX));
  const dmy = date ? formatDate(date) : '';

  async function copy(v: string, what: string) {
    try {
      await navigator.clipboard.writeText(v);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  function open(url: string) {
    void copy(plate.replace(/\D/g, ''), 'plate');
    window.open(url, '_blank', 'noopener');
  }

  async function mark(name: string, insured: boolean, claimName?: string) {
    if (!plate.trim()) return setMsg('נא להזין את מספר הרכב הפוגע');
    setBusy(name);
    setMsg(null);
    await addCaseEvent(c.id, { kind: 'NOTE', body: `${PREFIX} — רכב ${plate} לתאריך ${dmy || '—'}: ${name} — ${insured ? '✓ מבוטח' : '✗ לא מבוטח'}` });
    if (insured) {
      await updateCollectionCase(c.id, { tp_insurer: claimName ?? name, ...(c.tp_plate ? {} : { tp_plate: plate }), ...(c.event_date || !date ? {} : { event_date: date }) });
      setMsg(`✓ נשמר: הרכב הפוגע מבוטח ב${name}. חברת הביטוח של צד ג׳ עודכנה בתיק.`);
    }
    setBusy(null);
    router.refresh();
  }

  async function noneFound() {
    setBusy('none');
    await addCaseEvent(c.id, { kind: 'NOTE', body: `${PREFIX} — רכב ${plate} לתאריך ${dmy || '—'}: לא נמצא ביטוח באף חברה (לבדוק מול קרנית)` });
    setBusy(null);
    setMsg('נרשם בתיק: לא נמצא ביטוח באף חברה.');
    router.refresh();
  }

  const input = 'h-10 px-3 rounded-lg border border-gray-300 text-sm bg-white';
  return (
    <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
      <div>
        <p className="font-bold text-gray-900">🔎 בדיקת ביטוח לרכב הפוגע</p>
        <p className="text-sm text-gray-600">לפני דרישת תשלום: לוחצים על חברה — נפתח אתר הבדיקה שלה ומספר הרכב מועתק להדבקה. מסמנים את התשובה, והיא נשמרת בתיק.</p>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-xs text-gray-500">
          מספר הרכב הפוגע
          <span className="flex gap-1">
            <input value={plate} onChange={(e) => setPlate(e.target.value)} dir="ltr" inputMode="numeric" className={`${input} block w-36`} />
            <button type="button" onClick={() => void copy(plate.replace(/\D/g, ''), 'plate')} className="h-10 px-2 rounded-lg border border-gray-300 bg-white text-xs">
              {copied === 'plate' ? '✓' : '📋'}
            </button>
          </span>
        </label>
        <label className="text-xs text-gray-500">
          תאריך האירוע
          <span className="flex gap-1">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${input} block`} />
            <button type="button" disabled={!dmy} onClick={() => void copy(dmy, 'date')} className="h-10 px-2 rounded-lg border border-gray-300 bg-white text-xs disabled:opacity-40">
              {copied === 'date' ? '✓' : '📋'}
            </button>
          </span>
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {INSURER_CHECKS.map((i) => (
          <div key={i.name} className="rounded-xl border border-gray-200 bg-white p-2 flex items-center justify-between gap-2">
            <button type="button" onClick={() => open(i.url)} className="text-sm font-semibold text-indigo-700 text-right">
              {i.name} ↗{i.note && <span className="block text-[11px] font-normal text-gray-500">{i.note}</span>}
            </button>
            <span className="flex gap-1 shrink-0">
              <button type="button" disabled={!!busy} onClick={() => void mark(i.name, true, i.claimName)} className="h-8 px-2 rounded-lg bg-green-600 text-white text-xs font-semibold disabled:opacity-50">✓ מבוטח</button>
              <button type="button" disabled={!!busy} onClick={() => void mark(i.name, false)} className="h-8 px-2 rounded-lg border border-gray-300 text-xs disabled:opacity-50">✗ לא</button>
            </span>
          </div>
        ))}
      </div>
      <button type="button" disabled={!!busy || !plate.trim()} onClick={() => void noneFound()} className="text-xs text-gray-600 underline disabled:opacity-40">
        לא נמצא ביטוח באף חברה — לרשום בתיק
      </button>
      {msg && <p className="text-sm text-green-800">{msg}</p>}
      {history.length > 0 && (
        <div className="text-xs text-gray-600 space-y-0.5">
          <p className="font-semibold">בדיקות שנרשמו:</p>
          {history.slice(0, 12).map((e) => (
            <p key={e.id}>{e.body.replace(`${PREFIX} — `, '')} <span className="text-gray-400">· {e.created_by_name ?? ''}</span></p>
          ))}
        </div>
      )}
    </div>
  );
}
