'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startMfaEnroll, verifyMfaEnroll, verifyMfaLogin } from '@/app/actions/mfa';
import { logoutAction } from '@/app/actions/auth';
import { Logo } from '@/components/Logo';

// The two screens of the two-step login (Amit, 15/10): "חיבור Duo" once, and
// "קוד מ-Duo" on every new sign-in. Plain words — painters use it too.

function CodeInput({ value, onChange, onEnter }: { value: string; onChange: (v: string) => void; onEnter: () => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      onKeyDown={(e) => e.key === 'Enter' && onEnter()}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus
      dir="ltr"
      placeholder="000000"
      className="w-full text-center tracking-[0.5em] text-2xl font-bold border border-gray-300 rounded-xl px-3 py-3 outline-none focus:border-brand-red"
    />
  );
}

export function MfaClient({ enrolled, name }: { enrolled: boolean; name: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  async function begin() {
    setBusy(true);
    setErr(null);
    const r = await startMfaEnroll();
    setBusy(false);
    if (r.error || !r.factorId || !r.qr || !r.secret) return setErr(r.error ?? 'ההרשמה נכשלה');
    setEnroll({ factorId: r.factorId, qr: r.qr, secret: r.secret });
  }

  async function submit() {
    if (code.length !== 6) return setErr('הקוד הוא 6 ספרות');
    setBusy(true);
    setErr(null);
    const r = enrolled ? await verifyMfaLogin(code) : enroll ? await verifyMfaEnroll(enroll.factorId, code) : { error: 'קודם סורקים את הקוד' };
    setBusy(false);
    if (r.error) {
      setCode('');
      return setErr(r.error);
    }
    router.replace(r.home ?? '/');
    router.refresh();
  }

  const button = 'w-full bg-brand-red text-white py-3 rounded-xl font-bold disabled:opacity-50';
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4" dir="rtl">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex justify-center">
          <Logo variant="login" />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          {enrolled ? (
            <>
              <h1 className="text-lg font-bold text-gray-900">🔐 קוד מ-Duo</h1>
              <p className="text-sm text-gray-600">פותחים את Duo Mobile בטלפון ומקלידים את 6 הספרות שמופיעות ליד &quot;Tehila CRM&quot;.</p>
              <CodeInput value={code} onChange={setCode} onEnter={() => void submit()} />
              <button type="button" disabled={busy || code.length !== 6} onClick={() => void submit()} className={button}>
                {busy ? 'בודק…' : 'כניסה'}
              </button>
            </>
          ) : !enroll ? (
            <>
              <h1 className="text-lg font-bold text-gray-900">🔐 חיבור Duo — פעם אחת</h1>
              <p className="text-sm text-gray-700">
                שלום{name ? ` ${name.split(' ')[0]}` : ''}! מהיום הכניסה למערכת היא בשני שלבים: סיסמה + קוד מאפליקציית Duo Mobile שכבר יש לך בטלפון.
              </p>
              <p className="text-sm text-gray-700">עושים את זה פעם אחת, לוקח דקה. בכניסות הבאות רק מקלידים את הקוד מ-Duo.</p>
              <button type="button" disabled={busy} onClick={() => void begin()} className={button}>
                {busy ? 'מכין…' : 'מתחילים'}
              </button>
            </>
          ) : (
            <>
              <h1 className="text-lg font-bold text-gray-900">🔐 חיבור Duo</h1>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal pr-5">
                <li>פותחים את <b>Duo Mobile</b> בטלפון.</li>
                <li>לוחצים <b>+</b> או <b>Add</b> (הוספה), ואז <b>Use QR code</b> (סריקת קוד).</li>
                <li>סורקים את הריבוע:</li>
              </ol>
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={enroll.qr} alt="קוד QR לחיבור Duo" className="w-52 h-52 border border-gray-200 rounded-lg bg-white p-2" />
              </div>
              <button type="button" onClick={() => setShowSecret((v) => !v)} className="text-xs text-indigo-700 underline">
                מתחבר מאותו טלפון ואי אפשר לסרוק? הקלדה ידנית
              </button>
              {showSecret && (
                <p className="text-xs text-gray-600">
                  ב-Duo: <b>Use QR code</b> ← <b>Enter code manually</b>, ומקלידים:
                  <span dir="ltr" className="block font-mono text-sm text-gray-900 break-all mt-1 select-all">{enroll.secret}</span>
                </p>
              )}
              <p className="text-sm text-gray-700">4. מקלידים כאן את 6 הספרות שמופיעות עכשיו ב-Duo ליד &quot;Tehila CRM&quot;:</p>
              <CodeInput value={code} onChange={setCode} onEnter={() => void submit()} />
              <button type="button" disabled={busy || code.length !== 6} onClick={() => void submit()} className={button}>
                {busy ? 'בודק…' : 'סיום החיבור'}
              </button>
            </>
          )}
          {err && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</p>}
          <p className="text-xs text-gray-500">החלפת טלפון או בעיה? פונים לעמית והוא מאפס את החיבור.</p>
        </div>
        <form action={logoutAction} className="text-center">
          <button type="submit" className="text-sm text-gray-500 underline">יציאה</button>
        </form>
      </div>
    </div>
  );
}
