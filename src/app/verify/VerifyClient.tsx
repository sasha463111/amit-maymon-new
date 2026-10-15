'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestLoginCode, verifyLoginCode } from '@/app/actions/loginCode';
import { logoutAction } from '@/app/actions/auth';
import { Logo } from '@/components/Logo';

// "קוד כניסה ב-SMS" (2026-10-15): the code is sent as soon as the page opens;
// on the phone it pops up above the keyboard (one-time-code autofill).

export function VerifyClient({ name }: { name: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [noPhone, setNoPhone] = useState(false);
  const [wait, setWait] = useState(0);
  const asked = useRef(false);

  async function send() {
    setErr(null);
    setBusy(true);
    const r = await requestLoginCode();
    setBusy(false);
    if (r.noPhone) setNoPhone(true);
    if (r.error) return setErr(r.error);
    setSentTo(r.sentTo ?? null);
    setWait(60);
  }

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void send();
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit() {
    if (code.length !== 6) return setErr('הקוד הוא 6 ספרות');
    setBusy(true);
    setErr(null);
    const r = await verifyLoginCode(code, remember);
    setBusy(false);
    if (r.error) {
      setCode('');
      return setErr(r.error);
    }
    router.replace(r.home ?? '/');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4" dir="rtl">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex justify-center">
          <Logo variant="login" />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          <h1 className="text-lg font-bold text-gray-900">📱 קוד כניסה</h1>
          {noPhone ? (
            <p className="text-sm text-red-700">אין לך מספר נייד במערכת, ולכן אי אפשר לשלוח קוד. פנה לעמית כדי שיוסיף את הנייד שלך.</p>
          ) : (
            <>
              <p className="text-sm text-gray-700">
                {name ? `${name.split(' ')[0]}, ` : ''}
                {sentTo ? `שלחנו SMS עם קוד בן 6 ספרות לנייד ${sentTo}.` : 'שולחים לך SMS עם קוד…'}
              </p>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => e.key === 'Enter' && void submit()}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                dir="ltr"
                placeholder="000000"
                className="w-full text-center tracking-[0.5em] text-2xl font-bold border border-gray-300 rounded-xl px-3 py-3 outline-none focus:border-brand-red"
              />
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="w-5 h-5" />
                לזכור את הטלפון הזה ל-30 יום (בלי קוד בכניסות הבאות)
              </label>
              <button type="button" disabled={busy || code.length !== 6} onClick={() => void submit()} className="w-full bg-brand-red text-white py-3 rounded-xl font-bold disabled:opacity-50">
                {busy ? 'בודק…' : 'כניסה'}
              </button>
              <button type="button" disabled={busy || wait > 0} onClick={() => void send()} className="w-full text-sm text-indigo-700 underline disabled:text-gray-400 disabled:no-underline">
                {wait > 0 ? `אפשר לשלוח קוד חדש בעוד ${wait} שניות` : 'לא הגיע? שליחת קוד חדש'}
              </button>
            </>
          )}
          {err && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</p>}
          <p className="text-xs text-gray-500">החלפת מספר או בעיה? פונים לעמית.</p>
        </div>
        <form action={logoutAction} className="text-center">
          <button type="submit" className="text-sm text-gray-500 underline">יציאה</button>
        </form>
      </div>
    </div>
  );
}
