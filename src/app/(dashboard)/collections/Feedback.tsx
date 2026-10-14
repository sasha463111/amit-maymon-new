'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { answerFeedback, sendBetaFeedback, type Feedback, type FeedbackKind } from '@/app/actions/collectionFile';

// Beta feedback (Amit, 2026-10-14): the collectors work in parallel with BAFI
// and write what to fix, what to add — "כל חלום". Goes to Amit (push +
// "הודעות"); he and Chani see the list and answer.

const KINDS: [FeedbackKind, string][] = [
  ['IDEA', '💡 רעיון לשיפור'],
  ['PROBLEM', '⚠️ משהו לא עובד'],
  ['DREAM', '✨ חלום'],
];
const STATUS: Record<string, [string, string]> = {
  NEW: ['חדש', 'bg-blue-100 text-blue-800'],
  PLANNED: ['בתכנון', 'bg-amber-100 text-amber-800'],
  DONE: ['בוצע ✓', 'bg-green-100 text-green-800'],
  NO: ['לא כרגע', 'bg-gray-100 text-gray-600'],
};
const at = (iso: string) => new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function FeedbackButton({ page }: { page?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>('IDEA');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setMsg(null);
    const r = await sendBetaFeedback(kind, body, page ?? (typeof window !== 'undefined' ? window.location.pathname : null));
    setBusy(false);
    if (r.error) return setMsg(`⚠️ ${r.error}`);
    setBody('');
    setMsg('✓ נשלח לעמית — תודה!');
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setMsg(null); }} className="h-11 px-4 rounded-xl border-2 border-amber-300 bg-amber-50 text-amber-900 text-sm font-bold">
        💡 פידבק / חלום
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-2" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">💡 מה לשפר? מה חסר? מה החלום?</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 text-xl" aria-label="סגור">✕</button>
            </div>
            <p className="text-sm text-gray-600">זו גרסת בטא — כל הערה עוזרת. נשלח ישר לעמית.</p>
            <div className="flex gap-1.5 flex-wrap">
              {KINDS.map(([k, l]) => (
                <button key={k} type="button" onClick={() => setKind(k)} className={`h-9 px-3 rounded-lg border text-sm font-semibold ${kind === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300'}`}>
                  {l}
                </button>
              ))}
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              autoFocus
              placeholder={kind === 'DREAM' ? 'למשל: שהמערכת תשלח לבד דרישת תשלום לחברה אחרי 30 יום' : kind === 'PROBLEM' ? 'מה ניסית לעשות ומה קרה?' : 'מה יעזור לך לעבוד מהר יותר?'}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
            />
            {msg && <p className="text-sm">{msg}</p>}
            <button type="button" onClick={() => void send()} disabled={busy || body.trim().length < 3} className="w-full h-11 rounded-xl bg-red-600 text-white font-bold disabled:opacity-40">
              {busy ? 'שולח…' : 'שליחה'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function FeedbackList({ items, supervisor }: { items: Feedback[]; supervisor: boolean }) {
  if (!items.length) return <p className="text-gray-400 py-8 text-center">עוד אין פידבק. לוחצים &quot;💡 פידבק / חלום&quot; למעלה.</p>;
  return (
    <div className="space-y-2">
      {items.map((f) => (
        <FeedbackRow key={f.id} f={f} supervisor={supervisor} />
      ))}
    </div>
  );
}

function FeedbackRow({ f, supervisor }: { f: Feedback; supervisor: boolean }) {
  const router = useRouter();
  const [reply, setReply] = useState(f.reply ?? '');
  const [busy, setBusy] = useState(false);
  const [st, label] = [f.status, STATUS[f.status] ?? STATUS.NEW];

  async function set(status: 'NEW' | 'PLANNED' | 'DONE' | 'NO') {
    setBusy(true);
    await answerFeedback(f.id, status, reply);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-gray-500">
        <span className="font-semibold text-gray-800">{KINDS.find(([k]) => k === f.kind)?.[1]}</span>
        <span>
          {f.by ?? ''} · {at(f.at)} · <span className={`px-2 py-0.5 rounded-full font-bold ${label[1]}`}>{label[0]}</span>
        </span>
      </div>
      <p className="text-sm text-gray-900 whitespace-pre-wrap">{f.body}</p>
      {!supervisor && f.reply && <p className="text-sm text-indigo-800 bg-indigo-50 rounded-lg px-3 py-2">תשובה: {f.reply}</p>}
      {supervisor && (
        <div className="flex flex-wrap gap-2 items-center">
          <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="תשובה (רשות)" className="flex-1 min-w-[180px] h-9 px-3 rounded-lg border border-gray-300 text-sm" />
          {(['PLANNED', 'DONE', 'NO'] as const).map((k) => (
            <button key={k} type="button" disabled={busy} onClick={() => void set(k)} className={`h-9 px-3 rounded-lg border text-xs font-semibold ${st === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300'}`}>
              {STATUS[k][0]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
