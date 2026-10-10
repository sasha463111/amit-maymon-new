'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getNoteRecipients,
  replyToMessage,
  sendGeneralMessage,
  type InboxMessage,
  type NoteRecipient,
  type OutboxMessage,
} from '@/app/actions/caseNotes';
import { markRead } from '@/app/actions/notifications';
import { formatDateTime } from '@/lib/dates';

type Tab = 'inbox' | 'sent';

export function MessagesClient({ inbox, sent, error }: { inbox: InboxMessage[]; sent: OutboxMessage[]; error?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('inbox');
  const [composing, setComposing] = useState(false);
  const unread = inbox.filter((m) => !m.read).length;

  // New messages show up without reloading the page.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <div className="max-w-3xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">✉️ הודעות</h1>
          <p className="text-sm text-gray-500">הערות ושאלות שנשלחו אליך מכל התיקים, ומה ששלחת</p>
        </div>
        <button
          type="button"
          onClick={() => setComposing((v) => !v)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 shrink-0"
        >
          {composing ? 'סגור' : '+ הודעה חדשה'}
        </button>
      </div>

      {composing && (
        <NewMessage
          onSent={() => {
            setComposing(false);
            setTab('sent');
            router.refresh();
          }}
        />
      )}

      {error && <p className="text-sm text-red-600">⚠️ {error}</p>}

      <div className="flex gap-2 border-b border-gray-200">
        {([
          ['inbox', `נכנסות${unread ? ` (${unread} חדשות)` : ''}`],
          ['sent', 'יוצאות'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
              tab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'inbox' ? (
        inbox.length === 0 ? (
          <p className="text-center text-gray-400 py-10">אין הודעות עדיין</p>
        ) : (
          <ul className="space-y-3">
            {inbox.map((m) => (
              <InboxItem key={m.id} m={m} onChange={() => router.refresh()} />
            ))}
          </ul>
        )
      ) : sent.length === 0 ? (
        <p className="text-center text-gray-400 py-10">עוד לא שלחת הודעות</p>
      ) : (
        <ul className="space-y-3">
          {sent.map((m, i) => (
            <li key={i} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">
                אל:{' '}
                {m.to.map((t, j) => (
                  <span key={j} className="font-semibold text-gray-700">
                    {j > 0 ? ', ' : ''}
                    {t.name} <span className={t.read ? 'text-green-600' : 'text-gray-400'}>{t.read ? '✓ נקרא' : '• לא נקרא'}</span>
                  </span>
                ))}{' '}
                · {formatDateTime(m.at)}
              </p>
              <CaseTag caseId={m.caseId} label={m.caseLabel} />
              <p className="text-sm text-gray-800 whitespace-pre-wrap break-words mt-1">{m.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CaseTag({ caseId, label }: { caseId: string | null; label: string | null }) {
  if (!caseId) return <p className="text-xs text-gray-400 mt-1">הודעה כללית</p>;
  return (
    <Link href={`/go/${caseId}`} className="inline-block mt-1 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-0.5 hover:bg-indigo-100">
      🚗 {label} · פתח תיק ←
    </Link>
  );
}

function InboxItem({ m, onChange }: { m: InboxMessage; onChange: () => void }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [read, setRead] = useState(m.read);

  async function handleRead() {
    setRead(true);
    await markRead(m.id);
    onChange();
  }

  async function handleReply() {
    setBusy(true);
    setMsg(null);
    const res = await replyToMessage(m.id, text);
    setBusy(false);
    if ('error' in res && res.error) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setMsg({ ok: true, text: `התשובה נשלחה אל ${m.from} ✓` });
    setText('');
    setReplying(false);
    setRead(true);
    onChange();
  }

  return (
    <li className={`rounded-xl border p-4 ${read ? 'bg-white border-gray-200' : 'bg-indigo-50 border-indigo-300 shadow-sm'}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm">
          {!read && <span className="inline-block w-2 h-2 rounded-full bg-indigo-600 ml-1.5 align-middle" />}
          <span className="font-bold text-gray-900">{m.from}</span>
          <span className="text-xs text-gray-500"> · {formatDateTime(m.at)}</span>
        </p>
        {m.title.startsWith('↩️') && <span className="text-xs text-gray-500 shrink-0">תשובה</span>}
      </div>
      <CaseTag caseId={m.caseId} label={m.caseLabel} />
      <p className={`text-sm whitespace-pre-wrap break-words mt-1.5 ${read ? 'text-gray-700' : 'text-gray-900 font-medium'}`}>{m.text}</p>

      {replying && (
        <div className="mt-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={2000}
            autoFocus
            placeholder={`תשובה ל${m.from}…`}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-y bg-white"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        {m.fromId &&
          (replying ? (
            <>
              <button
                type="button"
                disabled={busy || !text.trim()}
                onClick={() => void handleReply()}
                className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40"
              >
                {busy ? 'שולח…' : 'שלח תשובה'}
              </button>
              <button type="button" onClick={() => setReplying(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800">
                ביטול
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setReplying(true)}
              className="px-4 py-1.5 bg-white border border-indigo-300 text-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-50"
            >
              ↩️ השב
            </button>
          ))}
        {!read && !replying && (
          <button
            type="button"
            onClick={() => void handleRead()}
            className="px-4 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
          >
            ✓ קראתי
          </button>
        )}
        {msg && <span className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.ok ? '' : '⚠️ '}{msg.text}</span>}
      </div>
    </li>
  );
}

function NewMessage({ onSent }: { onSent: () => void }) {
  const [recipients, setRecipients] = useState<NoteRecipient[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void getNoteRecipients().then((r) => setRecipients(r.recipients));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    setBusy(true);
    setErr(null);
    const res = await sendGeneralMessage(Array.from(selected), text);
    setBusy(false);
    if ('error' in res && res.error) {
      setErr(res.error);
      return;
    }
    onSent();
  }

  return (
    <div className="bg-white rounded-xl border-2 border-indigo-200 shadow-md p-4">
      <p className="text-xs text-gray-500 mb-2">הודעה כללית. להודעה על רכב מסוים — שלחו מתוך התיק (💬 שליחת הערה / שאלה), כך היא תופיע גם בתיק.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="כתבו כאן את ההודעה…"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-y"
      />
      <p className="text-sm font-medium text-gray-700 mt-3 mb-2">למי לשלוח?</p>
      <div className="flex flex-wrap gap-2">
        {recipients.length === 0 && <span className="text-xs text-gray-400">טוען רשימה…</span>}
        {recipients.map((r) => {
          const on = selected.has(r.id);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => toggle(r.id)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-indigo-50'
              }`}
            >
              {on ? '✓ ' : ''}
              {r.name} <span className={on ? 'text-indigo-100' : 'text-gray-400'}>· {r.role}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          disabled={busy || !text.trim() || selected.size === 0}
          onClick={() => void handleSend()}
          className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40"
        >
          {busy ? 'שולח…' : `שלח${selected.size > 0 ? ` (${selected.size})` : ''}`}
        </button>
        {err && <span className="text-sm text-red-600">⚠️ {err}</span>}
      </div>
    </div>
  );
}
