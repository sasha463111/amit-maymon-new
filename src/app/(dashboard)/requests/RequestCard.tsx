'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addRequestMessage,
  createAppRequest,
  setRequestKind,
  setRequestPriority,
  setRequestStatus,
  type AppRequest,
  type AppRequestEvent,
  type RequestKind,
  type RequestStatus,
} from '@/app/actions/appRequests';
import { shrinkImage } from '@/lib/shrinkImage';

// Shared by "💡 הערות לשיפור" (/requests — everyone) and the CEO boards
// "🐞 באגים" (/bugs) and "🚀 פיתוחים" (/features) — Tomer, 15/10.

export const STATUS: Record<RequestStatus, [string, string]> = {
  NEW: ['🆕 חדש', 'bg-blue-100 text-blue-800'],
  IN_PROGRESS: ['🔧 בעבודה', 'bg-amber-100 text-amber-800'],
  DONE: ['✅ בוצע', 'bg-green-100 text-green-800'],
  NO: ['⏸ לא כרגע', 'bg-gray-100 text-gray-600'],
};
export const KIND: Record<RequestKind, [string, string]> = {
  BUG: ['🐞 באג', 'bg-red-100 text-red-800'],
  FEATURE: ['🚀 פיתוח', 'bg-violet-100 text-violet-800'],
};
export const PRIORITY: Record<number, [string, string]> = {
  1: ['🔴 דחוף', 'bg-red-600 text-white'],
  2: ['🟠 רגיל', 'bg-amber-100 text-amber-900'],
  3: ['⚪ נמוך', 'bg-gray-100 text-gray-600'],
};
export const at = (iso: string) => new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/** New request (with the bug / feature choice) or a reply in a thread. */
export function Composer({ requestId, onDone, placeholder, cta, defaultKind }: { requestId?: string; onDone: () => void; placeholder: string; cta: string; defaultKind?: RequestKind }) {
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<RequestKind | null>(defaultKind ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function send() {
    if (!requestId && !kind) return setErr('נא לבחור: באג או פיתוח');
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append('body', body);
    if (requestId) fd.append('request_id', requestId);
    else fd.append('kind', kind!);
    if (file) fd.append('image', await shrinkImage(file));
    const r = requestId ? await addRequestMessage(fd) : await createAppRequest(fd);
    setBusy(false);
    if (r.error) return setErr(r.error);
    setBody('');
    setFile(null);
    if (!defaultKind) setKind(null);
    if (ref.current) ref.current.value = '';
    onDone();
  }

  return (
    <div className="space-y-2">
      {!requestId && (
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['BUG', '🐞 באג', 'משהו לא עובד / לא תקין'],
              ['FEATURE', '🚀 פיתוח', 'משהו חדש / שיפור'],
            ] as const
          ).map(([k, l, d]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-xl border-2 px-3 py-2 text-right ${kind === k ? (k === 'BUG' ? 'border-red-500 bg-red-50' : 'border-violet-500 bg-violet-50') : 'border-gray-200 bg-white'}`}
            >
              <span className="block font-bold text-sm">{l}</span>
              <span className="block text-xs text-gray-500">{d}</span>
            </button>
          ))}
        </div>
      )}
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

const STATUS_WORD: Record<string, string> = { NEW: '🆕 נפתח', IN_PROGRESS: '🔧 בעבודה', DONE: '✅ בוצע', NO: '⏸ לא כרגע' };
const fieldLine = (e: AppRequestEvent): string => {
  if (e.field === 'CREATED') return '🆕 נפתח';
  if (e.field === 'STATUS') return e.to === 'NEW' ? '↩️ נפתח מחדש' : STATUS_WORD[e.to ?? ''] ?? e.to ?? '';
  if (e.field === 'PRIORITY') return `עדיפות: ${e.to ? PRIORITY[Number(e.to)]?.[0] ?? e.to : 'ללא'}`;
  return `סוג: ${e.to ? KIND[e.to as RequestKind]?.[0] ?? e.to : '—'}`;
};

/** History (15/10): נפתח → בעבודה → בוצע, with date and who; priority / kind changes small. */
function Timeline({ events }: { events: AppRequestEvent[] }) {
  if (!events.length) return null;
  return (
    <ol className="relative border-r-2 border-gray-200 pr-4 space-y-2 text-xs">
      {events.map((e) => {
        const main = e.field === 'CREATED' || e.field === 'STATUS';
        return (
          <li key={e.id} className="relative">
            <span className={`absolute -right-[21px] top-1 w-2.5 h-2.5 rounded-full ${main ? 'bg-indigo-500' : 'bg-gray-300'}`} />
            <span className={main ? 'font-bold text-gray-900' : 'text-gray-500'}>{fieldLine(e)}</span>
            <span className="text-gray-500">
              {' '}· {at(e.at)} · {e.by ?? '🛠 צוות הפיתוח'}
            </span>
            {e.note && <p className="mt-0.5 text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-md px-2 py-1">📝 {e.note}</p>}
            {e.commit && <p className="mt-0.5 text-gray-500" dir="ltr">commit: {e.commit}</p>}
          </li>
        );
      })}
    </ol>
  );
}

/** Closing a ticket (DONE / NO): "מה בוצע" (required for DONE), commit,
 *  notify the requester (default on), and "שינוי שמשפיע על כולם" → 🆕 מה חדש. */
function ClosePanel({ r, to, onCancel, onDone }: { r: AppRequest; to: 'DONE' | 'NO'; onCancel: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [commit, setCommit] = useState('');
  const [notify, setNotify] = useState(true);
  const [announce, setAnnounce] = useState(false);
  const [title, setTitle] = useState((r.messages[0]?.body || '').replace(/\s+/g, ' ').slice(0, 80));
  const [body, setBody] = useState('');
  const [push, setPush] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const done = to === 'DONE';

  async function save() {
    if (done && note.trim().length < 3) return setErr('צריך לכתוב "מה בוצע"');
    if (announce && !title.trim()) return setErr('צריך כותרת להודעה לכולם');
    setBusy(true);
    setErr(null);
    const res = await setRequestStatus(r.id, to, {
      note,
      commit: done ? commit : null,
      notify,
      announce: announce ? { title, body: body || note, push } : null,
    });
    setBusy(false);
    if (res.error) return setErr(res.error);
    onDone();
  }

  return (
    <div className={`rounded-xl border-2 p-3 space-y-2 text-sm ${done ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
      <p className="font-bold">{done ? '✅ סגירה — בוצע' : '⏸ סגירה — לא כרגע'}</p>
      <label className="block">
        <span className="text-xs font-semibold text-gray-700">{done ? 'מה בוצע? *' : 'למה לא כרגע? (רשות)'}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 bg-white" placeholder={done ? 'למשל: בטופס המסירה אפשר עכשיו לסמן ביטול השתתפות בלי תאריך סיום' : ''} />
      </label>
      {done && (
        <label className="block">
          <span className="text-xs font-semibold text-gray-700">קומיט (רשות)</span>
          <input value={commit} onChange={(e) => setCommit(e.target.value)} dir="ltr" className="mt-1 w-full h-9 px-3 rounded-lg border border-gray-300 bg-white" placeholder="abc1234" />
        </label>
      )}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="w-4 h-4" />
        לעדכן את מי שפתח ({r.by || '—'})
      </label>
      {done && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} className="w-4 h-4" />
          שינוי שמשפיע על כולם — להציג ב-🆕 מה חדש
        </label>
      )}
      {done && announce && (
        <div className="rounded-lg border border-emerald-300 bg-white p-2 space-y-1.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-gray-300" placeholder="כותרת — מה השתנה" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-300" placeholder='פירוט (ריק = הטקסט של "מה בוצע")' />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} className="w-4 h-4" />
            לשלוח גם התראה לטלפון לכל המשתמשים
          </label>
        </div>
      )}
      {err && <p className="text-red-600">⚠️ {err}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => void save()} className={`h-10 px-5 rounded-xl text-white font-bold disabled:opacity-50 ${done ? 'bg-green-600' : 'bg-gray-700'}`}>
          {busy ? 'שומר…' : 'סגירת הטיקט'}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="h-10 px-4 rounded-xl border border-gray-300 bg-white">
          ביטול
        </button>
      </div>
    </div>
  );
}

/** One request: chips, the thread, a reply box and — for a CEO — management. */
export function RequestCard({ r, isCeo, highlight = false, collapsible = false }: { r: AppRequest; isCeo: boolean; highlight?: boolean; collapsible?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!collapsible || highlight);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState<'DONE' | 'NO' | null>(null);
  const first = r.messages[0];

  async function run(fn: () => Promise<{ error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.error) window.alert(res.error);
    router.refresh();
  }

  return (
    <div id={r.id} className={`rounded-2xl border bg-white p-4 space-y-3 ${highlight ? 'ring-2 ring-amber-400' : 'border-gray-200'}`}>
      <button type="button" onClick={() => collapsible && setOpen(!open)} className={`w-full text-right space-y-1.5 ${collapsible ? 'cursor-pointer' : 'cursor-default'}`}>
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <span className={`px-2.5 py-1 rounded-full font-bold ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
          {r.kind ? <span className={`px-2.5 py-1 rounded-full font-bold ${KIND[r.kind][1]}`}>{KIND[r.kind][0]}</span> : <span className="px-2.5 py-1 rounded-full font-bold bg-yellow-100 text-yellow-800">❔ לא מסווג</span>}
          {r.priority && <span className={`px-2.5 py-1 rounded-full font-bold ${PRIORITY[r.priority][1]}`}>{PRIORITY[r.priority][0]}</span>}
          <span className="text-gray-500 mr-auto">
            {isCeo && r.by ? `${r.by} · ` : ''}נפתחה {at(r.created_at)}
            {r.messages.length > 1 ? ` · ${r.messages.length} הודעות` : ''}
          </span>
        </div>
        {collapsible && !open && first && <p className="text-sm text-gray-800 line-clamp-2 whitespace-pre-wrap">{first.body || '(צילום מסך)'}</p>}
      </button>

      {open && (
        <>
          <Timeline events={r.events} />
          <div className="space-y-2">
            {r.messages.map((m) => (
              <div key={m.id} className={`rounded-xl px-3 py-2 text-sm ${m.from_dev ? 'bg-indigo-50 border border-indigo-100 mr-6' : 'bg-gray-50 border border-gray-100 ml-6'}`}>
                <p className="text-[11px] text-gray-500 mb-0.5">
                  {m.from_dev ? '🛠 צוות הפיתוח' : m.author} · {at(m.at)}
                </p>
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
          <Composer requestId={r.id} onDone={() => router.refresh()} placeholder={isCeo ? 'תשובה למבקש/ת (תגיע אליו/ה בהתראה)…' : 'תגובה / הבהרה…'} cta="שליחה" />
          {isCeo && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-2.5 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-gray-600 w-12">סטטוס:</span>
                {(Object.keys(STATUS) as RequestStatus[]).map((s) => (
                  <button key={s} type="button" disabled={busy || r.status === s} onClick={() => (s === 'DONE' || s === 'NO' ? setClosing(s) : void run(() => setRequestStatus(r.id, s)))} className={`h-8 px-2.5 rounded-lg border font-semibold ${r.status === s ? `${STATUS[s][1]} border-transparent` : 'bg-white border-gray-300'} disabled:cursor-default`}>
                    {STATUS[s][0]}
                  </button>
                ))}
              </div>
              {closing && (
                <ClosePanel
                  r={r}
                  to={closing}
                  onCancel={() => setClosing(null)}
                  onDone={() => {
                    setClosing(null);
                    router.refresh();
                  }}
                />
              )}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-gray-600 w-12">עדיפות:</span>
                {[1, 2, 3].map((p) => (
                  <button key={p} type="button" disabled={busy} onClick={() => void run(() => setRequestPriority(r.id, r.priority === p ? null : p))} className={`h-8 px-2.5 rounded-lg border font-semibold ${r.priority === p ? `${PRIORITY[p][1]} border-transparent` : 'bg-white border-gray-300'}`}>
                    {PRIORITY[p][0]}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-gray-600 w-12">סוג:</span>
                {(Object.keys(KIND) as RequestKind[]).map((k) => (
                  <button key={k} type="button" disabled={busy || r.kind === k} onClick={() => void run(() => setRequestKind(r.id, k))} className={`h-8 px-2.5 rounded-lg border font-semibold ${r.kind === k ? `${KIND[k][1]} border-transparent` : 'bg-white border-gray-300'} disabled:cursor-default`}>
                    {KIND[k][0]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
