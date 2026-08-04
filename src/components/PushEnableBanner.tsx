'use client';

import { useEffect, useState } from 'react';
import { BellRing, Share, X } from 'lucide-react';
import { usePushSubscription } from './usePushSubscription';

const DISMISS_KEY = '__push_banner_dismissed__';

/**
 * Prominent top-of-app banner that nudges every user to turn on push until they
 * actually do. The small in-bell PushSubscriber control was too easy to miss,
 * so most staff never enabled push. This shows on every page for anyone who is
 * not subscribed; it self-hides the moment push is on. A user can dismiss it for
 * the current session, but it returns next launch until push is enabled.
 */
export function PushEnableBanner() {
  const { status, busy, error, enable } = usePushSubscription();
  // Start hidden to avoid a flash before we know the real state.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  // Only the two actionable states get a banner. Subscribed/denied/unsupported
  // /unknown render nothing.
  if (status !== 'unsubscribed' && status !== 'ios-needs-pwa') return null;
  if (dismissed) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  if (status === 'ios-needs-pwa') {
    return (
      <div className="bg-accent text-white px-3 sm:px-6 py-2.5 flex items-center gap-3 text-sm">
        <Share size={18} className="shrink-0" />
        <p className="flex-1 leading-tight">
          כדי לקבל התראות ב-iPhone: לחץ על כפתור השיתוף בספארי ובחר{' '}
          <strong>&quot;הוסף למסך הבית&quot;</strong>, ואז פתח את האפליקציה מהמסך הבית.
        </p>
        <button type="button" onClick={dismiss} className="shrink-0 p-1 opacity-80 hover:opacity-100" title="הסתר">
          <X size={16} />
        </button>
      </div>
    );
  }

  // status === 'unsubscribed'
  return (
    <div className="bg-accent text-white px-3 sm:px-6 py-2.5 flex items-center gap-3">
      <BellRing size={20} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">הפעל התראות כדי לא לפספס עדכונים</p>
        <p className="text-xs opacity-90 leading-tight hidden sm:block">
          תקבל התראה מיידית על בקשות, אישורים וסיום שלבים גם כשהאפליקציה סגורה.
        </p>
        {error && <p className="text-xs mt-1 bg-white/15 rounded px-2 py-1 break-words">{error}</p>}
      </div>
      <button
        type="button"
        onClick={() => void enable()}
        disabled={busy}
        className="shrink-0 bg-white text-accent font-bold text-sm px-4 py-1.5 rounded-lg hover:bg-white/90 disabled:opacity-60"
      >
        {busy ? 'מפעיל…' : 'הפעל'}
      </button>
      <button type="button" onClick={dismiss} className="shrink-0 p-1 opacity-80 hover:opacity-100" title="הסתר">
        <X size={16} />
      </button>
    </div>
  );
}
