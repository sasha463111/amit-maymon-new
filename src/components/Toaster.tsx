'use client';

import { useEffect, useState } from 'react';

// One toast for the whole app (16/10, UI round): a short "done" line at the
// bottom, optionally with "ביטול" (undo) — instead of a confirm() dialog before
// a reversible action. Mounted once in the dashboard layout, so it survives a
// navigation (e.g. "סיום עבודה" → back to the board, the undo still shows).
// Usage: toast('✅ נשמר') or toast('הרכב ירד מהלוח', { undo: async () => … }).

type ToastItem = { id: number; text: string; tone: 'ok' | 'error'; undo?: () => Promise<unknown> | unknown };
type Listener = (t: ToastItem) => void;
const listeners = new Set<Listener>();
let seq = 0;

export function toast(text: string, opts: { undo?: ToastItem['undo']; tone?: ToastItem['tone'] } = {}) {
  const item: ToastItem = { id: ++seq, text, tone: opts.tone ?? 'ok', undo: opts.undo };
  listeners.forEach((l) => l(item));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => {
    const onToast: Listener = (t) => {
      setItems((cur) => [...cur.slice(-2), t]);
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), t.undo ? 8000 : 4000);
    };
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
    };
  }, []);
  if (!items.length) return null;
  return (
    <div className="fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-3 pointer-events-none bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6" dir="rtl" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-center gap-3 max-w-md w-full sm:w-auto rounded-xl px-4 py-3 shadow-lg text-sm font-semibold ${t.tone === 'error' ? 'bg-red-700 text-white' : 'bg-gray-900 text-white'}`}
        >
          <span className="flex-1">{t.text}</span>
          {t.undo && (
            <button
              type="button"
              disabled={busy === t.id}
              onClick={async () => {
                setBusy(t.id);
                try {
                  await t.undo?.();
                } finally {
                  setBusy(null);
                  setItems((cur) => cur.filter((x) => x.id !== t.id));
                }
              }}
              className="shrink-0 h-8 px-3 rounded-lg bg-white/15 hover:bg-white/25 font-bold disabled:opacity-50"
            >
              {busy === t.id ? '…' : '↩️ ביטול'}
            </button>
          )}
          <button type="button" onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))} aria-label="סגירה" className="shrink-0 w-7 h-7 rounded-lg hover:bg-white/15">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
