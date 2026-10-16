'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { tipsFor, TIPS, type Tip } from '@/lib/tips';
import { markTipsSeen } from '@/app/actions/tips';

// First-visit tips (16/10, UI round #10): one short tip at a time, next to the
// button it explains, the first time a person opens a screen. Non-blocking (no
// dark overlay — the page keeps working); "הבנתי" moves on, "דלג על הטיפים"
// ends them all. See src/lib/tips.ts.

type Shown = { tip: Tip; el: HTMLElement; index: number; total: number };

const visible = (el: Element | null): el is HTMLElement => {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

export function FirstVisitTips({ role, seen: initialSeen }: { role: string; seen: string[] }) {
  const pathname = usePathname();
  const [seen, setSeen] = useState<Set<string>>(() => new Set(initialSeen));
  const [shown, setShown] = useState<Shown | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxH, setBoxH] = useState(150);

  const findNext = useCallback(
    (seenNow: Set<string>) => {
      const pending = tipsFor(pathname, role).filter((t) => !seenNow.has(t.key));
      const withAnchor = pending
        .map((tip) => ({ tip, el: tip.anchors.map((a) => Array.from(document.querySelectorAll(`[data-tip="${a}"]`)).find(visible)).find(Boolean) as HTMLElement | undefined }))
        .filter((x): x is { tip: Tip; el: HTMLElement } => !!x.el);
      if (!withAnchor.length) return null;
      const all = tipsFor(pathname, role);
      const first = withAnchor[0];
      return { tip: first.tip, el: first.el, index: all.findIndex((t) => t.key === first.tip.key) + 1, total: all.length };
    },
    [pathname, role],
  );

  // On every screen: wait for it to render, then show the first unseen tip (one retry for slow pages).
  useEffect(() => {
    setShown(null);
    if (!tipsFor(pathname, role).some((t) => !seen.has(t.key))) return;
    let cancelled = false;
    const tryShow = () => {
      if (cancelled) return false;
      const next = findNext(seen);
      if (next) {
        next.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setShown(next);
      }
      return !!next;
    };
    let t2: ReturnType<typeof setTimeout> | undefined;
    const t1 = setTimeout(() => {
      if (!tryShow()) t2 = setTimeout(tryShow, 2500);
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
    // seen is read at the time of navigation only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, role, findNext]);

  // Follow the anchor while scrolling / resizing.
  useEffect(() => {
    if (!shown) return;
    const update = () => setRect(shown.el.isConnected ? shown.el.getBoundingClientRect() : null);
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const iv = setInterval(update, 400); // smooth scroll / layout shifts
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      clearInterval(iv);
    };
  }, [shown]);

  useLayoutEffect(() => {
    if (boxRef.current) setBoxH(boxRef.current.offsetHeight);
  }, [shown, rect]);

  if (!shown || !rect) return null;

  function done(keys: string[]) {
    const next = new Set(seen);
    keys.forEach((k) => next.add(k));
    setSeen(next);
    void markTipsSeen(keys);
    const n = findNext(next);
    if (n) n.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setShown(n);
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(320, vw - 24);
  const below = rect.bottom + 12 + boxH < vh - 80;
  const top = below ? rect.bottom + 12 : Math.max(12, rect.top - 12 - boxH);
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), vw - width - 12);
  const pad = 6;

  return (
    <>
      {/* ring around the button the tip is about */}
      <div
        aria-hidden="true"
        className="fixed z-[55] pointer-events-none rounded-xl transition-all"
        style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 4px rgba(176, 48, 47, 0.6)' }}
      />
      <div
        ref={boxRef}
        role="dialog"
        aria-label={`טיפ: ${shown.tip.title}`}
        dir="rtl"
        className="fixed z-[56] rounded-xl bg-gray-900 text-white shadow-2xl p-3.5 space-y-2"
        style={{ top, left, width }}
        data-tip-box={shown.tip.key}
      >
        <p className="font-bold">💡 {shown.tip.title}</p>
        <p className="text-sm text-gray-200 leading-relaxed">{shown.tip.body}</p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <button type="button" onClick={() => done(TIPS.map((t) => t.key))} className="text-xs text-gray-400 underline hover:text-white">
            דלג על הטיפים
          </button>
          <div className="flex items-center gap-2">
            {shown.total > 1 && <span className="text-xs text-gray-400">{shown.index} מתוך {shown.total}</span>}
            <button type="button" onClick={() => done([shown.tip.key])} className="h-8 px-3.5 rounded-lg bg-brand-red hover:bg-brand-red-dark text-sm font-bold">
              הבנתי
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
