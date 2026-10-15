'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KIT_DOCS } from '@/lib/claimKit';
import { KitPages, type KitValues } from '@/components/claimKit/KitPages';

// The kit screen (Amit, 15/10): pick the documents (the claim type suggests
// them), type into the pages, print / save as PDF. Sending it to the customer
// to fill and sign remotely is the next stage (the customer link).

export function KitClient({ backHref, suggested, initial, summary }: { backHref: string; suggested: string[]; initial: KitValues; summary: { label: string; value: string }[] }) {
  const [selected, setSelected] = useState<string[]>(suggested);
  const [values, setValues] = useState<KitValues>(initial);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : KIT_DOCS.map((d) => d.id).filter((x) => x === id || s.includes(x))));

  return (
    <div className="max-w-5xl mx-auto space-y-4" dir="rtl">
      <style>{`@media print { body * { visibility: hidden !important; } #claim-kit, #claim-kit * { visibility: visible !important; } #claim-kit { position: absolute; inset: 0; } }`}</style>
      <div className="print:hidden space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Link href={backHref} className="text-sm text-indigo-700 font-semibold">→ חזרה להפניה</Link>
          <h1 className="text-xl font-bold">📄 קיט מסמכים</h1>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-700">אילו מסמכים בקיט? (סימנו לפי סוג התביעה — אפשר לשנות)</p>
          <div className="grid gap-1.5 md:grid-cols-2">
            {KIT_DOCS.map((d) => (
              <label key={d.id} className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} className="mt-1 w-4 h-4" />
                <span>
                  <b>{d.title}</b>
                  {d.subtitle ? ` — ${d.subtitle}` : ''}
                  {suggested.includes(d.id) && <span className="text-green-700"> · מומלץ לתביעה הזו</span>}
                  <span className="block text-xs text-gray-500">{d.when}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap pt-2">
            <button type="button" onClick={() => window.print()} className="h-11 px-5 rounded-xl bg-gray-900 text-white font-bold">🖨️ הדפסה / שמירה כ-PDF</button>
            <span className="text-xs text-gray-500 self-center">מקלידים ישר בתוך הדפים (השדות הכחולים). ערך שמוקלד פעם אחת מתמלא בכל המסמכים.</span>
          </div>
          <p className="text-xs text-gray-500">השלב הבא: שליחת הקיט ללקוח בקישור — ימלא ויחתום מהטלפון, והמסמכים החתומים יחזרו לתיק.</p>
        </div>
      </div>
      <div id="claim-kit" className="bg-gray-100 print:bg-white rounded-2xl print:rounded-none p-2 md:p-6 print:p-0 overflow-x-auto">
        <KitPages selected={selected} values={values} setValues={setValues} summary={summary} />
      </div>
    </div>
  );
}
