'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps every dashboard page current: refreshes the server data when the
 * window comes back into view and every 30 seconds while it is visible.
 *
 * Never while someone is working (Amit, 2026-10-15: "פתחתי חלון לרשום הערה,
 * אחרי דקה הכול נסגר ונמחק" — it happened again and again): some screens
 * reset their open dialog / typed text when fresh data arrives. So the
 * refresh waits while a field has focus, while a dialog / overlay is open, and
 * for two minutes after the last keystroke or tap; it runs as soon as the
 * person is idle again.
 *
 * History: first added to the cases list only (2026-10-07, Eran/Amit: new
 * cases didn't appear). Moved here 2026-10-11 after Amit: "אילנית סוגרת תיק
 * ובמחשב אחר מראה שהתיק פתוח" — /closure (and referrals, painters,
 * approvals) never refreshed on their own.
 */
const QUIET_MS = 120_000;

export function isUserBusy(lastInteraction: number): boolean {
  if (Date.now() - lastInteraction < QUIET_MS) return true;
  const el = document.activeElement as HTMLElement | null;
  if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return true;
  // An open dialog / bottom sheet / modal overlay.
  if (document.querySelector('[role="dialog"], [aria-modal="true"], .fixed.inset-0')) return true;
  return false;
}

export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let last = 0;
    const touch = () => {
      last = Date.now();
    };
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (isUserBusy(last)) return;
      router.refresh();
    };
    const timer = window.setInterval(refresh, intervalMs);
    const events = ['keydown', 'input', 'pointerdown', 'paste'] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, touch, { capture: true }));
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [router, intervalMs]);
  return null;
}
