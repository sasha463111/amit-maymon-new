'use client';

import { BellRing, BellOff, AlertCircle } from 'lucide-react';
import { usePushSubscription } from './usePushSubscription';

export function PushSubscriber() {
  const { status, busy, error, enable, disable } = usePushSubscription();

  if (status === 'unsupported') return null;
  if (status === 'unknown') return null;

  if (status === 'ios-needs-pwa') {
    return (
      <div className="px-3 py-2 text-[11px] bg-amber-50 border-t border-amber-100 text-amber-800">
        <p className="font-semibold flex items-center gap-1.5">
          <AlertCircle size={12} />
          ב-iPhone: יש להוסיף לבית
        </p>
        <p className="mt-0.5 leading-tight">
          לחץ על כפתור השיתוף בספארי ⇧ ובחר &quot;הוסף למסך הבית&quot;. אחרי הפעלת האפליקציה מהבית תוכל להפעיל push.
        </p>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="text-[11px] text-gray-500 px-3 py-2 bg-gray-50 border-t border-gray-100">
        🔕 Push חסום בדפדפן. שנה בהגדרות הדפדפן (settings → site permissions → notifications) ואז רענן.
      </div>
    );
  }

  if (status === 'subscribed') {
    return (
      <div className="flex items-center justify-between px-3 py-2 text-[11px] bg-green-50 border-t border-green-100">
        <span className="text-green-700 flex items-center gap-1.5">
          <BellRing size={12} />
          התראות push פעילות
        </span>
        <span className="flex items-center gap-3">
          <a href="/push-debug" className="text-gray-500 hover:text-blue-600 underline">אבחון</a>
          <button
            type="button"
            onClick={() => void disable()}
            disabled={busy}
            className="text-gray-500 hover:text-red-600 underline"
          >
            {busy ? '...' : 'כבה'}
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 text-[11px] bg-blue-50 border-t border-blue-100">
      <button
        type="button"
        onClick={() => void enable()}
        disabled={busy}
        className="flex items-center gap-1.5 text-blue-700 font-semibold hover:underline disabled:opacity-50"
      >
        <BellOff size={12} />
        {busy ? 'מפעיל...' : 'הפעל התראות push (גם כשהאפליקציה סגורה)'}
      </button>
      {error && (
        <p className="text-red-700 mt-1.5 bg-red-50 border border-red-200 rounded px-2 py-1 break-words">
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}
