'use client';

import { useEffect, useState } from 'react';

// "יש גרסה חדשה" (16/10): staff keep the app open for days, and an open tab
// keeps running the old code after an update ("למה אני לא רואה שינוי?"). Every
// few minutes, and when the window comes back into view, ask the server which
// build is live; if it changed since this page loaded, offer a refresh. The
// first answer is the baseline (not an id baked into this bundle: the server
// and browser bundles may be compiled separately and get different ids).
//
// And when an action FAILS because this tab is from an older version (Ilanit
// 16/10: after the Next 15 upgrade an old tab couldn't upload a file or open a
// case from a referral — every server action's id had changed), say so at once
// and loudly: the action didn't go through, refresh and try again.

/** A server action / RSC request rejected because the tab's code is older than the server. */
export const VERSION_SKEW = /Server Action .*(was not found|not found on the server)|Failed to find Server Action|unexpected response was received from the server|ChunkLoadError|Loading chunk \d+ failed/i;

export function UpdateBanner() {
  const [stale, setStale] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const isSkew = (x: unknown) => VERSION_SKEW.test(x instanceof Error ? `${x.name} ${x.message}` : String(x ?? ''));
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isSkew(e.reason)) {
        setStale(true);
        setFailed(true);
      }
    };
    const onError = (e: ErrorEvent) => {
      if (isSkew(e.error ?? e.message)) {
        setStale(true);
        setFailed(true);
      }
    };
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, []);
  useEffect(() => {
    let stop = false;
    let baseline: string | null = null;
    const check = async () => {
      if (stop || document.visibilityState !== 'visible') return;
      try {
        const r = await fetch('/api/version', { cache: 'no-store' });
        const { build } = (await r.json()) as { build?: string };
        if (!build) return;
        if (baseline === null) baseline = build;
        else if (build !== baseline) setStale(true);
      } catch {
        // offline — try again later
      }
    };
    void check();
    const t = window.setInterval(() => void check(), 5 * 60_000);
    const onVis = () => void check();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop = true;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  if (!stale) return null;
  return (
    <div className={`${failed ? 'bg-red-700 sticky top-0 z-[60]' : 'bg-gray-900'} text-white px-3 sm:px-6 py-2.5 flex items-center gap-3`} dir="rtl" role={failed ? 'alert' : 'status'}>
      <p className="flex-1 text-sm font-semibold">{failed ? '⚠️ המערכת עודכנה — הפעולה האחרונה לא נשמרה. לחצו "רענון" ונסו שוב.' : '🆕 יש גרסה חדשה של המערכת'}</p>
      <button type="button" onClick={() => window.location.reload()} className="h-9 px-4 rounded-lg bg-white text-gray-900 text-sm font-bold">
        רענון
      </button>
    </div>
  );
}
