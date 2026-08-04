'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { restoreCase } from '@/app/actions/workflow';
import { RotateCcw, FileText, Search, Clock, CheckCircle2, Trash2, ArrowUpDown } from 'lucide-react';
import { LicensePlate } from '@/components/ui/LicensePlate';

export type ArchiveRow = {
  id: string;
  case_key: string;
  plate: string;
  claim: string;
  customer: string;
  phone: string | null;
  insurance: string | null;
  opened_at: string | null;
  treatment_finished_at: string | null;
  closed_at: string | null;
  deleted_at: string | null;
  deleted_by_name: string;
  branch_name: string;
};

type TabKey = 'in_closure' | 'closed' | 'deleted';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return '—';
  }
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function ArchiveTabs({
  activeTab,
  inClosure,
  closed,
  deleted,
  canRestoreDeleted,
}: {
  activeTab: TabKey;
  inClosure: ArchiveRow[];
  closed: ArchiveRow[];
  deleted: ArchiveRow[];
  canRestoreDeleted: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>(activeTab);
  const [search, setSearch] = useState('');
  const [pending, startTransition] = useTransition();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sourceRows = tab === 'in_closure' ? inClosure : tab === 'closed' ? closed : deleted;
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return sourceRows;
    return sourceRows.filter((r) =>
      [r.plate, r.customer, r.claim, r.insurance ?? '', r.case_key, r.branch_name]
        .some((v) => v.toLowerCase().includes(s))
    );
  }, [sourceRows, search]);

  function switchTab(next: TabKey) {
    setTab(next);
    setSearch('');
    // keep tab in URL so refresh + share preserve state
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState({}, '', url.toString());
  }

  function handleRestore(row: ArchiveRow) {
    const ok = window.confirm(`לשחזר את התיק של ${row.customer} (${row.plate})?`);
    if (!ok) return;
    setRestoringId(row.id);
    setError(null);
    startTransition(async () => {
      const res = await restoreCase(row.id);
      if (res.error) {
        setError(res.error);
        setRestoringId(null);
      } else {
        router.refresh();
      }
    });
  }

  const TABS: { key: TabKey; label: string; icon: typeof Clock; count: number; tone: string }[] = [
    { key: 'in_closure', label: 'בתהליך סגירה', icon: Clock, count: inClosure.length, tone: 'amber' },
    { key: 'closed', label: 'סגורים', icon: CheckCircle2, count: closed.length, tone: 'emerald' },
  ];
  if (canRestoreDeleted) {
    TABS.push({ key: 'deleted', label: 'מחוקים', icon: Trash2, count: deleted.length, tone: 'rose' });
  }

  const TONE_CLASSES: Record<string, { active: string; inactive: string; chip: string }> = {
    amber: {
      active: 'bg-amber-100 text-amber-900 border-amber-400 shadow-sm',
      inactive: 'bg-white text-gray-600 border-gray-200 hover:bg-amber-50 hover:border-amber-200',
      chip: 'bg-amber-500 text-white',
    },
    emerald: {
      active: 'bg-emerald-100 text-emerald-900 border-emerald-400 shadow-sm',
      inactive: 'bg-white text-gray-600 border-gray-200 hover:bg-emerald-50 hover:border-emerald-200',
      chip: 'bg-emerald-500 text-white',
    },
    rose: {
      active: 'bg-rose-100 text-rose-900 border-rose-400 shadow-sm',
      inactive: 'bg-white text-gray-600 border-gray-200 hover:bg-rose-50 hover:border-rose-200',
      chip: 'bg-rose-500 text-white',
    },
  };

  return (
    <div dir="rtl" className="space-y-4">
      {/* Tabs — stack on phone, side-by-side on tablet+ */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        {/* fixed width per tab on desktop so they share the row equally */}
        {/* (each tab gets flex-1) */}
        {TABS.map(({ key, label, icon: Icon, count, tone }) => {
          const isActive = tab === key;
          const cls = TONE_CLASSES[tone];
          return (
            <button
              key={key}
              type="button"
              onClick={() => switchTab(key)}
              className={`relative flex-1 flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl border-2 transition-all text-right ${
                isActive ? cls.active : cls.inactive
              }`}
            >
              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 ${
                isActive ? 'bg-white/70' : 'bg-gray-100'
              }`}>
                <Icon size={16} className="sm:hidden" />
                <Icon size={18} className="hidden sm:block" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold leading-tight">{label}</p>
                <p className="text-[11px] sm:text-xs opacity-70">{count} תיקים</p>
              </div>
              {count > 0 && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls.chip} shrink-0`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי לקוח, רישוי, תביעה, חברת ביטוח..."
          className="w-full bg-white border border-gray-200 rounded-lg pr-9 pl-3 py-2.5 text-sm focus:border-brand-red focus:ring-2 focus:ring-brand-red/10 outline-none transition-all"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2 rounded-lg">
          ⚠️ {error}
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-gray-50 flex items-center justify-center mb-3">
            {tab === 'in_closure' ? (
              <Clock size={24} className="text-gray-400" />
            ) : tab === 'closed' ? (
              <CheckCircle2 size={24} className="text-gray-400" />
            ) : (
              <Trash2 size={24} className="text-gray-400" />
            )}
          </div>
          <p className="text-gray-500">
            {search ? 'לא נמצאו תוצאות לחיפוש' :
              tab === 'in_closure' ? 'אין כרגע תיקים בתהליך סגירה' :
              tab === 'closed' ? 'אין כרגע תיקים סגורים' :
              'אין תיקים מחוקים'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {/* MOBILE: cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {filtered.map((r) => {
              const dateValue =
                tab === 'in_closure' ? r.treatment_finished_at :
                tab === 'closed' ? r.closed_at :
                r.deleted_at;
              const days = daysSince(dateValue);
              const isStale = tab === 'in_closure' && days !== null && days > 7;
              return (
                <div key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-gray-900 truncate">{r.customer}</p>
                      <p className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                        <LicensePlate plate={r.plate} size="sm" />
                        {r.claim !== '—' && <span className="text-gray-400">· {r.claim}</span>}
                      </p>
                    </div>
                    {days !== null && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${isStale ? 'bg-rose-100 text-rose-700 font-semibold' : 'bg-gray-100 text-gray-500'}`}>
                        {days === 0 ? 'היום' : `${days}י׳${isStale ? ' ⚠️' : ''}`}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600 mb-3">
                    {r.phone && (
                      <a href={`tel:${r.phone}`} className="text-blue-600 truncate" dir="ltr">📞 {r.phone}</a>
                    )}
                    {r.insurance && <span className="truncate">🏢 {r.insurance}</span>}
                    {r.branch_name && r.branch_name !== '—' && <span className="truncate">📍 {r.branch_name}</span>}
                    {tab === 'deleted' && r.deleted_by_name !== '—' && (
                      <span className="truncate">❌ ע"י {r.deleted_by_name}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={tab === 'in_closure' ? `/closure/${r.id}` : `/cases/${r.id}`}
                      className="flex-1 text-center inline-flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold px-3 py-2 rounded-lg border border-indigo-200"
                    >
                      <FileText size={12} />
                      {tab === 'in_closure' ? 'המשך סגירה' : 'פתח תיק'}
                    </Link>
                    {tab === 'deleted' && canRestoreDeleted && (
                      <button
                        onClick={() => handleRestore(r)}
                        disabled={pending && restoringId === r.id}
                        className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-700 text-xs font-semibold px-3 py-2 rounded-lg border border-emerald-200"
                      >
                        <RotateCcw size={12} />
                        {pending && restoringId === r.id ? 'משחזר…' : 'שחזר'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* DESKTOP: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold">לקוח</th>
                  <th className="px-4 py-3 text-right font-semibold">רישוי</th>
                  <th className="px-4 py-3 text-right font-semibold">תביעה</th>
                  <th className="px-4 py-3 text-right font-semibold">חברת ביטוח</th>
                  <th className="px-4 py-3 text-right font-semibold">סניף</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    <span className="inline-flex items-center gap-1">
                      <ArrowUpDown size={12} />
                      {tab === 'in_closure' ? 'הועבר למשרד' : tab === 'closed' ? 'נסגר' : 'נמחק'}
                    </span>
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => {
                  const dateValue =
                    tab === 'in_closure' ? r.treatment_finished_at :
                    tab === 'closed' ? r.closed_at :
                    r.deleted_at;
                  const days = daysSince(dateValue);
                  const isStale = tab === 'in_closure' && days !== null && days > 7;

                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-800">{r.customer}</span>
                          {r.phone && (
                            <a href={`tel:${r.phone}`} className="text-xs text-blue-600 hover:underline mt-0.5" dir="ltr">
                              {r.phone}
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3"><LicensePlate plate={r.plate} size="sm" /></td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.claim}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{r.insurance ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{r.branch_name}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-gray-700">{formatDate(dateValue)}</span>
                          {days !== null && (
                            <span className={`text-[10px] mt-0.5 ${isStale ? 'text-rose-600 font-semibold' : 'text-gray-400'}`}>
                              {days === 0 ? 'היום' : `לפני ${days} ימים${isStale ? ' ⚠️' : ''}`}
                            </span>
                          )}
                          {tab === 'deleted' && r.deleted_by_name !== '—' && (
                            <span className="text-[10px] text-gray-400 mt-0.5">ע"י {r.deleted_by_name}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-left">
                        <div className="flex items-center gap-2 justify-end">
                          <Link
                            href={tab === 'in_closure' ? `/closure/${r.id}` : `/cases/${r.id}`}
                            className="inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold px-3 py-1.5 rounded-lg border border-indigo-200 transition-colors"
                          >
                            <FileText size={12} />
                            {tab === 'in_closure' ? 'המשך סגירה' : 'פתח תיק'}
                          </Link>
                          {tab === 'deleted' && canRestoreDeleted && (
                            <button
                              onClick={() => handleRestore(r)}
                              disabled={pending && restoringId === r.id}
                              className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors"
                            >
                              <RotateCcw size={12} />
                              {pending && restoringId === r.id ? 'משחזר…' : 'שחזר'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 10 && (
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-500 text-center">
              {filtered.length} תוצאות
            </div>
          )}
        </div>
      )}
    </div>
  );
}
