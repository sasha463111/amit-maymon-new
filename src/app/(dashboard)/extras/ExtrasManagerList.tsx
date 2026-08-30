'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateExtraStatus } from '@/app/actions/extras';
import type { ExtraStatus } from '@/types/database';
import { LicensePlate } from '@/components/ui/LicensePlate';

interface ExtraRow {
  id: string;
  case_id: string;
  description: string;
  image_path: string;
  image_url: string | null;
  status: ExtraStatus;
  created_at: string;
  case_key: string | null;
  plate: string;
}

const STATUS_LABELS: Record<ExtraStatus, string> = {
  IN_TREATMENT: 'בטיפול',
  REJECTED: 'נדחתה',
  DONE: 'בוצעה',
};
const STATUS_COLORS: Record<ExtraStatus, string> = {
  IN_TREATMENT: 'bg-amber-100 text-amber-800 border-amber-300',
  REJECTED: 'bg-red-100 text-red-700 border-red-300',
  DONE: 'bg-emerald-100 text-emerald-700 border-emerald-300',
};

// Default view is "still needs a decision" (IN_TREATMENT) — otherwise every
// extra ever created (done/rejected included) piles up forever in the same
// list, and the handful that actually need the manager's attention get lost
// in months of history. "הכל" is one tap away for anyone who wants it.
type TabFilter = 'IN_TREATMENT' | 'DONE' | 'REJECTED' | 'ALL';
const TABS: { key: TabFilter; label: string }[] = [
  { key: 'IN_TREATMENT', label: 'בטיפול' },
  { key: 'DONE', label: 'בוצעו' },
  { key: 'REJECTED', label: 'נדחו' },
  { key: 'ALL', label: 'הכל' },
];

export function ExtrasManagerList({ extras }: { extras: ExtraRow[] }) {
  const router = useRouter();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabFilter>('IN_TREATMENT');

  async function handleStatusChange(extraId: string, status: ExtraStatus) {
    setUpdatingId(extraId);
    setError(null);
    const res = await updateExtraStatus({ extra_id: extraId, status });
    setUpdatingId(null);
    if (res?.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  if (extras.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
        <div className="text-5xl mb-3">🎨</div>
        <p className="text-sm">אין תוספות פחחות</p>
      </div>
    );
  }

  const counts: Record<TabFilter, number> = {
    IN_TREATMENT: extras.filter((e) => e.status === 'IN_TREATMENT').length,
    DONE: extras.filter((e) => e.status === 'DONE').length,
    REJECTED: extras.filter((e) => e.status === 'REJECTED').length,
    ALL: extras.length,
  };
  const visible = tab === 'ALL' ? extras : extras.filter((e) => e.status === tab);

  return (
    <div dir="rtl">
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          ⚠️ {error}
        </div>
      )}
      <div className="flex gap-2 mb-4 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
              tab === t.key
                ? 'bg-brand-red text-white border-brand-red'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          <div className="text-5xl mb-3">🎨</div>
          <p className="text-sm">אין תוספות בקטגוריה זו</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((e) => (
          <article
            key={e.id}
            className={`bg-white rounded-xl border-2 shadow-sm overflow-hidden flex flex-col ${
              e.status === 'IN_TREATMENT' ? 'border-amber-200' :
              e.status === 'REJECTED' ? 'border-red-200' : 'border-emerald-200'
            }`}
          >
            {/* Image preview — taps open full size in new tab */}
            {e.image_url ? (
              <a
                href={e.image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-video bg-gray-100 border-b border-gray-200 overflow-hidden relative group"
              >
                <img
                  src={e.image_url}
                  alt={`תוספת — ${e.description.slice(0, 40)}`}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                  <span className="text-white text-xs font-semibold">פתח בגודל מלא</span>
                </div>
              </a>
            ) : (
              <div className="aspect-video bg-gray-50 border-b border-gray-200 flex items-center justify-center text-gray-300">
                <span className="text-4xl">🖼️</span>
              </div>
            )}

            <div className="p-3 flex-1 flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-2">
                <Link
                  href={`/cases/${e.case_id}`}
                  className="font-bold text-gray-800 text-sm hover:text-brand-red truncate flex items-center"
                  title={e.case_key ?? e.plate}
                >
                  {e.case_key ?? (e.plate !== '—' ? <LicensePlate plate={e.plate} size="sm" /> : e.plate)}
                </Link>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_COLORS[e.status]}`}>
                  {STATUS_LABELS[e.status]}
                </span>
              </div>
              <p className="text-sm text-gray-700 mb-3 whitespace-pre-wrap break-words flex-1">
                {e.description}
              </p>
              <p className="text-[10px] text-gray-400 mb-3">
                {new Date(e.created_at).toLocaleString('he-IL')}
              </p>
              <div className="flex gap-2">
                {e.status === 'IN_TREATMENT' && (
                  <>
                    <button
                      type="button"
                      disabled={updatingId === e.id}
                      onClick={() => void handleStatusChange(e.id, 'DONE' as ExtraStatus)}
                      className="flex-1 px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold disabled:opacity-50"
                    >
                      ✓ אישור
                    </button>
                    <button
                      type="button"
                      disabled={updatingId === e.id}
                      onClick={() => void handleStatusChange(e.id, 'REJECTED' as ExtraStatus)}
                      className="flex-1 px-2 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold disabled:opacity-50"
                    >
                      ✕ דחייה
                    </button>
                  </>
                )}
                {e.status !== 'IN_TREATMENT' && (
                  <button
                    type="button"
                    disabled={updatingId === e.id}
                    onClick={() => void handleStatusChange(e.id, 'IN_TREATMENT' as ExtraStatus)}
                    className="px-3 py-1 text-xs text-gray-500 hover:text-gray-800 underline disabled:opacity-50"
                  >
                    החזר לטיפול
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      )}
    </div>
  );
}
