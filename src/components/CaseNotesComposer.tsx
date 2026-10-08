'use client';

import { useEffect, useState } from 'react';
import { getCaseNotes, getNoteRecipients, sendCaseNote, type NoteRecipient, type SentNote } from '@/app/actions/caseNotes';
import { formatDateTime } from '@/lib/dates';

/**
 * "שליחת הערה" — free text on a case, sent to the people you pick. Each
 * recipient gets it as a notification (and push; Amit also by email). Below
 * the form: what was already sent in this case, by whom, to whom.
 */
export function CaseNotesComposer({ caseId, collapsible = false }: { caseId: string; collapsible?: boolean }) {
  // On the case pages it starts folded to a single button so it doesn't push
  // the case content down; the closure page shows it open.
  const [open, setOpen] = useState(!collapsible);
  const [recipients, setRecipients] = useState<NoteRecipient[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [notes, setNotes] = useState<SentNote[]>([]);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function loadNotes() {
    const res = await getCaseNotes(caseId);
    if (!res.error) setNotes(res.notes);
  }

  useEffect(() => {
    void getNoteRecipients().then((r) => setRecipients(r.recipients));
    void loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    setMsg(null);
    setSending(true);
    const res = await sendCaseNote(caseId, Array.from(selected), text);
    setSending(false);
    if ('error' in res && res.error) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    const names = recipients.filter((r) => selected.has(r.id)).map((r) => r.name).join(', ');
    setMsg({ ok: true, text: `נשלח אל: ${names} ✓` });
    setText('');
    setSelected(new Set());
    await loadNotes();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between gap-3 bg-white rounded-xl border-2 border-indigo-200 shadow-sm px-4 py-3 text-right hover:bg-indigo-50 transition-colors"
        dir="rtl"
      >
        <span className="font-bold text-gray-900">💬 שליחת הערה / שאלה</span>
        <span className="text-sm text-indigo-700">
          {notes.length > 0 ? `${notes.length} הערות בתיק · ` : ''}פתח ▾
        </span>
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border-2 border-indigo-200 shadow-md p-4 sm:p-6" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-900">💬 {collapsible ? 'שליחת הערה / שאלה' : 'שליחת הערה'}</h3>
        {collapsible && (
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-500 hover:text-gray-700">סגור ▴</button>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="כתבו כאן את ההערה…"
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
              {on ? '✓ ' : ''}{r.name} <span className={on ? 'text-indigo-100' : 'text-gray-400'}>· {r.role}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          disabled={sending || !text.trim() || selected.size === 0}
          onClick={() => void handleSend()}
          className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40"
        >
          {sending ? 'שולח…' : `שלח${selected.size > 0 ? ` (${selected.size})` : ''}`}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.ok ? '' : '⚠️ '}{msg.text}</span>}
      </div>

      {notes.length > 0 && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">הערות שנשלחו בתיק</p>
          <ul className="space-y-2">
            {notes.map((n, i) => (
              <li key={i} className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                <p className="text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">{n.from}</span> ← {n.to.join(', ')} · {formatDateTime(n.at)}
                </p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap break-words mt-0.5">{n.text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
