'use client';

import { useState } from 'react';
import type { DocItem } from '@/lib/customerDocs';
import { CustomerDocsForm } from '@/app/d/[token]/CustomerDocsForm';

// "👁️ תצוגה מקדימה" (Amit, 15/10, #36): the customer link exactly as the
// customer sees it on the phone — before sending (what will go out) and after
// (what went out, with what was already signed / uploaded). The real screens
// in preview mode: clicks work, nothing is sent or saved.

export type PreviewData = {
  name: string;
  plate: string | null;
  items: DocItem[];
  consent: { title: string; intro: string; sections: { head: string; body: string[] }[]; checkbox: string };
};

export function CustomerPreview({
  data,
  kit,
  uploaded = {},
  sent,
  onClose,
}: {
  data: PreviewData;
  kit: { docs: string[]; values: Record<string, string>; signed: string[] } | null;
  uploaded?: Record<string, number>;
  /** After sending: start past the consent page the customer already accepted. */
  sent?: { consented: boolean; completed: boolean; expiresAt: string };
  onClose: () => void;
}) {
  const [round, setRound] = useState(0);
  const expiresAt = sent?.expiresAt ?? new Date(Date.now() + 72 * 3600_000).toISOString();
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-3" dir="rtl" onClick={onClose}>
      <div className="w-full max-w-md my-4 space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-xl bg-amber-100 border border-amber-300 px-3 py-2 text-sm flex items-center justify-between gap-2">
          <span>
            <b>👁️ {sent ? 'מה שנשלח ללקוח' : 'תצוגה מקדימה'}</b> — כך הלקוח רואה את הקישור בטלפון. אפשר ללחוץ; שום דבר לא נשלח ולא נשמר.
          </span>
          <span className="flex gap-1 shrink-0">
            <button type="button" onClick={() => setRound((n) => n + 1)} className="h-8 px-2 rounded-lg border border-amber-400 bg-white text-xs">↺ מההתחלה</button>
            <button type="button" onClick={onClose} className="h-8 px-3 rounded-lg bg-gray-900 text-white text-xs font-bold">סגירה</button>
          </span>
        </div>
        <div className="rounded-[2rem] border-8 border-gray-800 bg-gray-50 px-4 py-5 max-h-[80vh] overflow-y-auto">
          <CustomerDocsForm
            key={round}
            preview
            token="preview"
            name={data.name}
            plate={data.plate}
            items={data.items}
            consent={data.consent}
            consented={round === 0 && !!sent?.consented}
            completed={round === 0 && !!sent?.completed}
            initialUploaded={round === 0 ? uploaded : {}}
            expiresAt={expiresAt}
            kit={kit && (round === 0 ? kit : { ...kit, signed: [] })}
          />
        </div>
      </div>
    </div>
  );
}
