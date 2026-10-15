'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppRequest } from '@/app/actions/appRequests';
import { AdvisorChat } from './AdvisorChat';
import type { AdvisorMessage } from '@/app/actions/advisor';
import { Composer, RequestCard } from './RequestCard';

// "💡 הצעות ייעול" (Amit, 15/10): write a request (+ a screenshot), see every
// answer from the development team in the same thread, and its status. Each
// new request is tagged 🐞 באג / 🚀 פיתוח and lands on the CEO boards
// /bugs and /features (Tomer, 15/10).

export function RequestsClient({ items, advisor, isCeo }: { items: AppRequest[]; advisor: { available: boolean; messages: AdvisorMessage[] } | null; isCeo: boolean }) {
  const router = useRouter();
  const [hash, setHash] = useState('');
  const [tab, setTab] = useState<'chat' | 'requests'>(advisor?.available ? 'chat' : 'requests');
  useEffect(() => {
    const h = window.location.hash.slice(1);
    setHash(h);
    if (h) setTab('requests');
  }, []);
  const open = items.filter((r) => r.status === 'NEW' || r.status === 'IN_PROGRESS');
  const closed = items.filter((r) => r.status === 'DONE' || r.status === 'NO');

  const card = (r: AppRequest) => <RequestCard key={r.id} r={r} isCeo={isCeo} highlight={hash === r.id} />;

  return (
    <div className="max-w-3xl mx-auto space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{isCeo ? '💡 הצעות ייעול' : '💡 הערות לשיפור'}</h1>
        <p className="text-sm text-gray-500">
          {isCeo
            ? 'כותבים בקשה (באג או פיתוח). את כל הבקשות של כולם מנהלים ב"🐞 באגים" וב"🚀 פיתוחים". כל שינוי עובר לאישור תומר.'
            : 'משהו לא עובד? חסר משהו? בוחרים באג או פיתוח וכותבים (אפשר עם צילום מסך). כל הערה נקראת, והתשובה תגיע לכאן עם התראה לטלפון.'}
        </p>
      </div>
      {advisor && (
      <div className="flex gap-2 border-b border-gray-200">
        {([['chat', '🤖 התייעצות'], ['requests', `💡 בקשות (${open.length} פתוחות)`]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? 'border-red-600 text-red-700' : 'border-transparent text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>
      )}
      {advisor && tab === 'chat' ? (
        <AdvisorChat available={advisor.available} messages={advisor.messages} />
      ) : (
      <>
      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 space-y-2">
        <p className="font-bold text-amber-900">{isCeo ? '➕ בקשה חדשה' : '➕ הערה חדשה'}</p>
        <Composer
          onDone={() => router.refresh()}
          placeholder={isCeo ? 'מה לשנות / להוסיף? למשל: במקום ״מכתב דרישת תשלום״ ← ״צור מכתב דרישת תשלום״' : 'מה לשפר? למשל: בהחזרת חלק אין סינון לפי סניף'}
          cta={isCeo ? 'שליחת הבקשה' : 'שליחת ההערה'}
        />
      </div>
      <section className="space-y-3">
        <h2 className="font-bold text-gray-800">בטיפול ({open.length})</h2>
        {open.length === 0 && <p className="text-sm text-gray-400">אין בקשות פתוחות</p>}
        {open.map(card)}
      </section>
      {closed.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold text-gray-800">הסתיימו ({closed.length})</h2>
          {closed.map(card)}
        </section>
      )}
      </>
      )}
    </div>
  );
}
