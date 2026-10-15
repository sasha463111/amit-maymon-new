'use client';

import { useEffect, useState } from 'react';

// "יש גרסה חדשה" (16/10): staff keep the app open for days, and an open tab
// keeps running the old code after an update ("למה אני לא רואה שינוי?"). Every
// few minutes, and when the window comes back into view, ask the server which
// build is live; if it changed since this page loaded, offer a refresh. The
// first answer is the baseline (not an id baked into this bundle: the server
// and browser bundles may be compiled separately and get different ids).

export function UpdateBanner() {
  const [stale, setStale] = useState(false);
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
    <div className="bg-gray-900 text-white px-3 sm:px-6 py-2.5 flex items-center gap-3" dir="rtl" role="status">
      <p className="flex-1 text-sm font-semibold">🆕 יש גרסה חדשה של המערכת</p>
      <button type="button" onClick={() => window.location.reload()} className="h-9 px-4 rounded-lg bg-white text-gray-900 text-sm font-bold">
        רענון
      </button>
    </div>
  );
}
