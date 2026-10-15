'use client';

import { useState } from 'react';
import { dismissAnnouncement, type Announcement } from '@/app/actions/announcements';

// "🆕 מה חדש" at the top of the dashboard (Tomer, 15/10) — each person
// closes it for themselves ("הבנתי").
export function WhatsNewBanner({ items }: { items: Announcement[] }) {
  const [shown, setShown] = useState(items);
  if (!shown.length) return null;

  async function dismiss(id: string) {
    setShown((s) => s.filter((a) => a.id !== id));
    await dismissAnnouncement(id);
  }

  return (
    <div className="bg-emerald-50 border-b border-emerald-200 px-3 sm:px-6 py-2 space-y-1.5" dir="rtl">
      {shown.map((a) => (
        <div key={a.id} className="flex items-start gap-2 text-sm text-emerald-950">
          <span className="font-black shrink-0">🆕 מה חדש</span>
          <span className="flex-1 min-w-0">
            <b>{a.title}</b>
            {a.body && <span className="block text-xs text-emerald-900 whitespace-pre-wrap">{a.body}</span>}
          </span>
          <button type="button" onClick={() => void dismiss(a.id)} className="shrink-0 h-7 px-2.5 rounded-lg bg-white border border-emerald-300 text-xs font-semibold">
            הבנתי ✕
          </button>
        </div>
      ))}
    </div>
  );
}
