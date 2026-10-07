'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { markRead } from '@/app/actions/notifications';
import { formatDateTime } from '@/lib/dates';

type CaseNotification = { id: string; title: string; body: string | null; created_at: string; type: string };

/**
 * Open notifications about THIS case, at the top of the case page, each with
 * a "טופל" button (requested by נסיה, 2026-10-07). The reason a step was
 * rejected ("מחירים נמוכים") used to be visible only in the bell dropdown,
 * away from the case it was about.
 *
 * "טופל" marks the notification read for the current user only — the same
 * per-person state as the bell. Renders nothing when there is nothing open.
 */
export function CaseNotificationsPanel({ initial }: { initial: CaseNotification[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) return null;

  async function handleDone(id: string) {
    setBusyId(id);
    setError(null);
    const res = await markRead(id);
    setBusyId(null);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setItems((prev) => prev.filter((n) => n.id !== id));
    router.refresh(); // keeps the bell's unread count in step
  }

  return (
    <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 sm:p-4" dir="rtl">
      <p className="text-sm font-bold text-red-800 mb-2">❗ התראות פתוחות בתיק ({items.length})</p>
      <ul className="space-y-2">
        {items.map((n) => (
          <li key={n.id} className="flex items-start gap-3 bg-white rounded-lg border border-red-200 px-3 py-2">
            <span className="text-red-600 font-bold text-lg leading-none mt-0.5" aria-hidden>!</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{n.title}</p>
              {n.body && <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{n.body}</p>}
              <p className="text-[11px] text-gray-400 mt-0.5">{formatDateTime(n.created_at)}</p>
            </div>
            <button
              type="button"
              disabled={busyId === n.id}
              onClick={() => void handleDone(n.id)}
              className="shrink-0 px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {busyId === n.id ? '...' : '✓ טופל'}
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-red-700 mt-2">⚠️ {error}</p>}
    </div>
  );
}
