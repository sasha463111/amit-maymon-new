'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps every dashboard page current: refreshes the server data when the
 * window comes back into view and every 30 seconds while it is visible.
 * router.refresh() re-renders server components only — what someone is typing
 * in a client component is kept.
 *
 * History: first added to the cases list only (2026-10-07, Eran/Amit: new
 * cases didn't appear). Moved here 2026-10-11 after Amit: "אילנית סוגרת תיק
 * ובמחשב אחר מראה שהתיק פתוח" — the close was saved, but /closure (and
 * referrals, painters, approvals) never refreshed on their own, so a screen
 * opened in the morning kept showing the case as open.
 */
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = window.setInterval(refresh, intervalMs);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [router, intervalMs]);
  return null;
}
