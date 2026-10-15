'use client';

import { useState } from 'react';
import { createCaseTrackLink } from '@/app/actions/caseTrack';

/** "📲 קישור מעקב ללקוח" (16/10, design round; pilot: CEO). */
export function CaseTrackButton({ caseId }: { caseId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ url: string; message: string; whatsapp: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  async function make() {
    setBusy(true);
    setErr(null);
    const r = await createCaseTrackLink(caseId);
    setBusy(false);
    if (r.error !== null) return setErr(r.error);
    setMade(r);
    if (r.whatsapp) window.open(r.whatsapp, '_blank', 'noopener');
  }

  return (
    <div className="mb-3 rounded-2xl border border-gray-200 bg-white p-3 flex flex-col gap-2" dir="rtl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="font-bold text-gray-900">📲 קישור מעקב ללקוח <span className="text-xs text-gray-500 font-normal">· פיילוט</span></p>
          <p className="text-xs text-gray-600">הלקוח רואה באיזה שלב הרכב — בלי להתקשר. קישור חדש מבטל את הקודם.</p>
        </div>
        <button type="button" disabled={busy} onClick={() => void make()} className="h-11 px-4 rounded-xl bg-green-600 text-white text-sm font-bold disabled:opacity-50">
          {busy ? 'יוצר…' : made ? '🔁 קישור חדש' : 'שליחה ללקוח'}
        </button>
      </div>
      {err && <p className="text-sm text-red-700">⚠️ {err}</p>}
      {made && (
        <div className="rounded-xl bg-gray-50 p-3 space-y-2">
          <pre className="whitespace-pre-wrap text-sm font-[inherit]">{made.message}</pre>
          <div className="flex gap-2 flex-wrap">
            {made.whatsapp && (
              <a href={made.whatsapp} target="_blank" rel="noopener noreferrer" className="h-10 px-3 rounded-lg bg-green-600 text-white text-sm font-semibold inline-flex items-center">פתיחה בוואטסאפ</a>
            )}
            <a href={made.url} target="_blank" rel="noopener noreferrer" className="h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm inline-flex items-center">👁️ מה הלקוח רואה</a>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(made.message).then(() => setCopied(true));
              }}
              className="h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm"
            >
              {copied ? '✓ הועתק' : 'העתקת ההודעה'}
            </button>
          </div>
          {!made.whatsapp && <p className="text-xs text-amber-700">אין בתיק נייד תקין — העתיקו את ההודעה ושלחו ידנית.</p>}
        </div>
      )}
    </div>
  );
}
