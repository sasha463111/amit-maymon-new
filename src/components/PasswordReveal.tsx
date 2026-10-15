'use client';

import { useState } from 'react';
import { passwordMessage } from '@/lib/passwordMessage';

// Shown once to the CEO after creating a user or resetting a password
// (Amit, 15/10): the password is not stored anywhere readable — copy it or
// send it on WhatsApp now.

const SITE = 'https://amit-maymon-new-psi.vercel.app';

export function PasswordReveal({ name, email, password, onClose }: { name: string; email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const msg = passwordMessage(name, email, password, SITE);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="rounded-xl border-2 border-green-300 bg-green-50 p-3 space-y-2 text-sm" dir="rtl">
      <p className="font-bold text-green-900">🔑 הסיסמה של {name || email}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-gray-500">מייל:</dt>
        <dd dir="ltr" className="text-right">{email}</dd>
        <dt className="text-gray-500">סיסמה:</dt>
        <dd dir="ltr" className="text-right font-mono font-bold text-lg">{password}</dd>
      </dl>
      <p className="text-xs text-amber-800">⚠️ הסיסמה מוצגת עכשיו בלבד. אחרי הסגירה אי אפשר לראות אותה שוב — רק לאפס.</p>
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => void copy(password, 'password')} className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold">
          {copied === 'password' ? '✓ הועתקה' : '📋 העתקת הסיסמה'}
        </button>
        <button type="button" onClick={() => void copy(msg, 'msg')} className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold">
          {copied === 'msg' ? '✓ ההודעה הועתקה' : '📋 העתקת הודעה מוכנה'}
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className="h-9 px-3 inline-flex items-center rounded-lg bg-green-600 text-white text-xs font-semibold">
          💬 שליחה בוואטסאפ
        </a>
        <button type="button" onClick={onClose} className="h-9 px-3 rounded-lg text-xs text-gray-600">
          סגירה
        </button>
      </div>
    </div>
  );
}
