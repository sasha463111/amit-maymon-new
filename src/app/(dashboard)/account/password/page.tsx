'use client';

import { useState } from 'react';
import { changeMyPassword } from '@/app/actions/myPassword';
import { PASSWORD_RULES, passwordProblems } from '@/lib/passwordPolicy';

// "🔑 החלפת סיסמה" (Amit, 15/10) — for everyone, from the key icon in the
// header. The rules turn green while typing, so nobody guesses.

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ready = passwordProblems(next).length === 0 && next === again && current.length > 0;

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await changeMyPassword(current, next);
    setBusy(false);
    if (r.error) return setMsg({ ok: false, text: r.error });
    setCurrent('');
    setNext('');
    setAgain('');
    setMsg({ ok: true, text: '✓ הסיסמה הוחלפה. בכניסה הבאה משתמשים בסיסמה החדשה.' });
  }

  const input = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-brand-red';
  const type = show ? 'text' : 'password';
  return (
    <div className="max-w-md mx-auto space-y-4" dir="rtl">
      <h1 className="text-xl font-bold text-gray-900">🔑 החלפת סיסמה</h1>
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <label className="block text-sm text-gray-700">
          הסיסמה הנוכחית
          <input type={type} value={current} onChange={(e) => setCurrent(e.target.value)} dir="ltr" autoComplete="current-password" autoCapitalize="none" className={input} />
        </label>
        <label className="block text-sm text-gray-700">
          סיסמה חדשה
          <input type={type} value={next} onChange={(e) => setNext(e.target.value)} dir="ltr" autoComplete="new-password" autoCapitalize="none" className={input} />
        </label>
        <ul className="text-sm space-y-0.5">
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(next);
            return (
              <li key={r.label} className={ok ? 'text-green-700' : 'text-gray-500'}>
                {ok ? '✓' : '○'} {r.label}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-gray-500">דוגמה לסיסמה טובה: <span dir="ltr" className="font-mono">Tehila#2026</span> (רק דוגמה — לבחור משהו אחר)</p>
        <label className="block text-sm text-gray-700">
          שוב את הסיסמה החדשה
          <input type={type} value={again} onChange={(e) => setAgain(e.target.value)} dir="ltr" autoComplete="new-password" autoCapitalize="none" className={input} />
        </label>
        {again && next !== again && <p className="text-sm text-red-600">הסיסמאות לא זהות</p>}
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="w-4 h-4" />
          להציג את הסיסמאות
        </label>
        {msg && <p className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
        <button type="button" disabled={!ready || busy} onClick={() => void save()} className="w-full bg-brand-red text-white py-3 rounded-xl font-bold disabled:opacity-40">
          {busy ? 'שומר…' : 'החלפת הסיסמה'}
        </button>
        <p className="text-xs text-gray-500">שכחת את הסיסמה הנוכחית? פונים לעמית והוא מאפס.</p>
      </div>
    </div>
  );
}
