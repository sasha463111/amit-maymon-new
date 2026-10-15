'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { askAdvisor, clearAdvisor, type AdvisorMessage } from '@/app/actions/advisor';

// "🤖 התייעצות" (Amit, 15/10): chat with Claude about the system. It answers
// right away; a change request is recorded and waits for Tomer's approval.

const at = (iso: string) => new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function AdvisorChat({ available, messages }: { available: boolean; messages: AdvisorMessage[] }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pending]);

  async function send() {
    const q = text.trim();
    if (!q || pending) return;
    setText('');
    setErr(null);
    setNote(null);
    setPending(q);
    const r = await askAdvisor(q);
    setPending(null);
    if (r.error) setErr(r.error);
    if (r.filed) setNote('✅ נרשמה בקשה — היא מופיעה בלשונית "💡 בקשות" וממתינה לאישור של תומר.');
    router.refresh();
  }

  async function fresh() {
    if (!window.confirm('להתחיל שיחה חדשה? השיחה הנוכחית תימחק (הבקשות שנרשמו נשארות).')) return;
    await clearAdvisor();
    router.refresh();
  }

  if (!available) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-600 space-y-1">
        <p className="font-bold text-gray-800">🤖 התייעצות</p>
        <p>⏳ היועץ עוד לא מחובר. בינתיים כותבים בלשונית &quot;💡 בקשות&quot; וצוות הפיתוח עונה שם.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white flex flex-col" style={{ minHeight: '60vh' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <p className="text-sm text-gray-600">שואלים כל שאלה על המערכת, מתייעצים על רעיון, או מבקשים שינוי. התשובה מגיעה מיד.</p>
        {messages.length > 0 && (
          <button type="button" onClick={() => void fresh()} className="text-xs text-gray-500 underline whitespace-nowrap">שיחה חדשה</button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[60vh]">
        {messages.length === 0 && !pending && (
          <div className="text-sm text-gray-500 space-y-1">
            <p>דוגמאות למה אפשר לשאול:</p>
            <p>• &quot;איך מחושב מועד הפירעון בתביעה של צד ג׳?&quot;</p>
            <p>• &quot;מה עדיף — שהמסלקות יקבלו תזכורת אחרי שבוע או אחרי עשרה ימים?&quot;</p>
            <p>• &quot;אני רוצה שבמסך ההחזרות יופיע גם שם הספק בכותרת&quot;</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`rounded-2xl px-3 py-2 text-sm max-w-[85%] ${m.role === 'user' ? 'bg-gray-100 ml-auto' : 'bg-indigo-50 border border-indigo-100 mr-auto'}`}>
            <p className="text-[11px] text-gray-500 mb-0.5">{m.role === 'user' ? 'אתה' : '🤖 היועץ'} · {at(m.at)}</p>
            <p className="whitespace-pre-wrap text-gray-900">{m.content}</p>
          </div>
        ))}
        {pending && (
          <>
            <div className="rounded-2xl px-3 py-2 text-sm max-w-[85%] bg-gray-100 ml-auto">
              <p className="whitespace-pre-wrap text-gray-900">{pending}</p>
            </div>
            <div className="rounded-2xl px-3 py-2 text-sm bg-indigo-50 border border-indigo-100 mr-auto text-gray-500">🤖 חושב…</div>
          </>
        )}
        <div ref={end} />
      </div>
      {note && <p className="mx-4 mb-2 text-sm text-green-800 bg-green-50 rounded-lg px-3 py-2">{note}</p>}
      {err && <p className="mx-4 mb-2 text-sm text-red-700">⚠️ {err}</p>}
      <div className="border-t border-gray-100 p-3 flex gap-2 items-end">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="כתבו כאן…"
          className="flex-1 px-3 py-2 rounded-xl border border-gray-300 text-sm"
        />
        <button type="button" disabled={!text.trim() || !!pending} onClick={() => void send()} className="h-11 px-5 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-40">
          שליחה
        </button>
      </div>
    </div>
  );
}
