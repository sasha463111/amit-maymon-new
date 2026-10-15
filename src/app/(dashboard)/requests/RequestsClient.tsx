'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addRequestMessage, createAppRequest, setRequestStatus, type AppRequest, type RequestStatus } from '@/app/actions/appRequests';
import { shrinkImage } from '@/lib/shrinkImage';
import { AdvisorChat } from './AdvisorChat';
import type { AdvisorMessage } from '@/app/actions/advisor';

// "💡 הצעות ייעול" (Amit, 15/10): write a request (+ a screenshot), see every
// answer from the development team in the same thread, and its status.

const STATUS: Record<RequestStatus, [string, string]> = {
  NEW: ['🆕 חדש', 'bg-blue-100 text-blue-800'],
  IN_PROGRESS: ['🔧 בעבודה', 'bg-amber-100 text-amber-800'],
  DONE: ['✅ בוצע', 'bg-green-100 text-green-800'],
  NO: ['⏸ לא כרגע', 'bg-gray-100 text-gray-600'],
};
const at = (iso: string) => new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function Composer({ requestId, onDone, placeholder, cta }: { requestId?: string; onDone: () => void; placeholder: string; cta: string }) {
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function send() {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append('body', body);
    if (requestId) fd.append('request_id', requestId);
    if (file) fd.append('image', await shrinkImage(file));
    const r = requestId ? await addRequestMessage(fd) : await createAppRequest(fd);
    setBusy(false);
    if (r.error) return setErr(r.error);
    setBody('');
    setFile(null);
    if (ref.current) ref.current.value = '';
    onDone();
  }

  return (
    <div className="space-y-2">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={requestId ? 2 : 4} placeholder={placeholder} className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm" />
      <div className="flex items-center gap-2 flex-wrap">
        <label className="h-10 px-3 inline-flex items-center rounded-xl border border-gray-300 bg-white text-sm cursor-pointer">
          📷 {file ? 'הוחלף צילום' : 'צירוף צילום מסך'}
          <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {file && <span className="text-xs text-gray-500 truncate max-w-[160px]">{file.name}</span>}
        <button type="button" disabled={busy || (!body.trim() && !file)} onClick={() => void send()} className="h-10 px-5 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-40">
          {busy ? 'שולח…' : cta}
        </button>
      </div>
      {err && <p className="text-sm text-red-600">⚠️ {err}</p>}
    </div>
  );
}

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

  async function close(id: string, s: RequestStatus) {
    await setRequestStatus(id, s);
    router.refresh();
  }

  const card = (r: AppRequest) => (
    <div key={r.id} id={r.id} className={`rounded-2xl border bg-white p-4 space-y-3 ${hash === r.id ? 'ring-2 ring-amber-400' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-gray-500">
        <span className={`px-2.5 py-1 rounded-full font-bold ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
        <span>{isCeo && r.by ? `${r.by} · ` : ''}נפתחה {at(r.created_at)}</span>
      </div>
      <div className="space-y-2">
        {r.messages.map((m) => (
          <div key={m.id} className={`rounded-xl px-3 py-2 text-sm ${m.from_dev ? 'bg-indigo-50 border border-indigo-100 mr-6' : 'bg-gray-50 border border-gray-100 ml-6'}`}>
            <p className="text-[11px] text-gray-500 mb-0.5">{m.from_dev ? '🛠 צוות הפיתוח' : m.author} · {at(m.at)}</p>
            {m.body && <p className="whitespace-pre-wrap text-gray-900">{m.body}</p>}
            {m.image_url && (
              <a href={m.image_url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.image_url} alt="צילום מסך" className="mt-2 max-h-56 rounded-lg border border-gray-200" />
              </a>
            )}
          </div>
        ))}
      </div>
      <Composer requestId={r.id} onDone={() => router.refresh()} placeholder="תגובה / הבהרה…" cta="שליחה" />
      {isCeo && r.status !== 'DONE' && r.status !== 'NO' && (
        <div className="flex gap-3 text-xs">
          <button type="button" onClick={() => void close(r.id, 'DONE')} className="text-green-700 underline">✓ סגור — הבקשה טופלה</button>
          <button type="button" onClick={() => void close(r.id, 'NO')} className="text-gray-500 underline">לא רלוונטי יותר</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{isCeo ? '💡 הצעות ייעול' : '💡 הערות לשיפור'}</h1>
        <p className="text-sm text-gray-500">
          {isCeo
            ? 'מתייעצים עם היועץ של המערכת, או כותבים בקשה לשינוי. כאן רואים גם את ההערות של העובדים. כל שינוי עובר לאישור תומר.'
            : 'משהו לא נוח? חסר משהו? כתבו כאן (אפשר עם צילום מסך). כל הערה נקראת, והתשובה תגיע לכאן עם התראה לטלפון.'}
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
