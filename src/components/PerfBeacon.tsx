'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Speed measurement (2026-10-13): how long each employee waits, per screen.
// Sends to /api/perf, batched, with navigator.sendBeacon. Invisible; any
// failure is ignored. Three kinds:
//   load — a full page load (ttfb = server answer, ms = until fully loaded)
//   nav  — a screen change inside the app: from the click until it is shown
//   bell — one load of the notifications bell (event 'perf:bell' from the bell)
// Remove this component and /api/perf when the investigation is over.

type Sample = { kind: 'load' | 'nav' | 'bell'; path: string; ms: number; ttfb?: number; role: string; net?: string; rtt?: number; mobile: boolean };

const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const norm = (p: string) => p.replace(ID, ':id').split('?')[0];

export function PerfBeacon({ role }: { role: string }) {
  const pathname = usePathname();
  const queue = useRef<Sample[]>([]);
  const clickAt = useRef<number | null>(null);
  const firstPath = useRef(true);

  function base() {
    const c = (navigator as Navigator & { connection?: { effectiveType?: string; rtt?: number } }).connection;
    return { role, net: c?.effectiveType, rtt: c?.rtt, mobile: /Mobi|Android|iPhone/i.test(navigator.userAgent) };
  }
  function push(s: Omit<Sample, 'role' | 'mobile' | 'net' | 'rtt'>) {
    queue.current.push({ ...base(), ...s });
    if (queue.current.length >= 5) flush();
  }
  function flush() {
    if (!queue.current.length) return;
    const body = JSON.stringify({ samples: queue.current.splice(0) });
    try {
      if (!navigator.sendBeacon?.('/api/perf', new Blob([body], { type: 'application/json' }))) {
        void fetch('/api/perf', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } });
      }
    } catch {
      /* ignore */
    }
  }

  // Full page load.
  useEffect(() => {
    const report = () => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (nav && nav.loadEventEnd > 0) push({ kind: 'load', path: norm(location.pathname), ms: nav.loadEventEnd, ttfb: nav.responseStart });
    };
    if (document.readyState === 'complete') setTimeout(report, 0);
    else window.addEventListener('load', () => setTimeout(report, 0), { once: true });

    // Clicks that navigate inside the app start the 'nav' clock.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="/"], button');
      if (a) clickAt.current = performance.now();
    };
    const onBell = (e: Event) => {
      const ms = (e as CustomEvent<{ ms: number }>).detail?.ms;
      if (typeof ms === 'number') push({ kind: 'bell', path: norm(location.pathname), ms });
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('perf:bell', onBell);
    document.addEventListener('visibilitychange', onHide);
    const timer = setInterval(flush, 60_000);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('perf:bell', onBell);
      document.removeEventListener('visibilitychange', onHide);
      clearInterval(timer);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Screen change: measured after the new screen has painted.
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    const start = clickAt.current;
    clickAt.current = null;
    if (start === null) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const ms = performance.now() - start;
        if (ms < 30_000) push({ kind: 'nav', path: norm(pathname), ms });
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
