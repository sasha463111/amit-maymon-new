'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LicensePlate } from '@/components/ui/LicensePlate';
import { PAINTER_STATUS_LABELS } from '@/types/database';
import { formatDate } from '@/lib/dates';
import { SegmentedControl } from '@/components/design/SegmentedControl';

export interface PainterRow {
  id: string;
  case_key: string | null;
  customer_name: string | null;
  painter_status: string | null;
  painter_status_other_text: string | null;
  appraiser_name: string | null;
  opened_at: string | null;
  license_plate: string | null;
  car_make: string | null;
  car_model: string | null;
  car_year: number | null;
  car_vehicle_type: string | null;
  branch_name: string | null;
}

// Case creation only ever fills `vehicle_type` (Ministry-of-Transport lookup,
// e.g. "טויוטה קורולה") — make/model are basically always empty in practice,
// so prefer it and fall back to make+model for any older/manually-entered car.
function carLineFor(row: Pick<PainterRow, 'car_vehicle_type' | 'car_make' | 'car_model' | 'car_year'>) {
  const desc = row.car_vehicle_type?.trim() || [row.car_make, row.car_model].filter(Boolean).join(' ');
  return [desc, row.car_year].filter(Boolean).join(' · ');
}

const PAINTER_STATUS_ICON: Record<string, string> = {
  IN_WORK: '🔧',
  WAITING_PARTS: '⏳',
  PARTS_ARRIVED: '🎨',
  READY_FOR_RELEASE: '✅',
  OTHER: '❓',
};

// Column header: colored fill + a bottom border in the deeper shade of the same hue.
const PAINTER_STATUS_COLUMN_HEAD: Record<string, string> = {
  IN_WORK: 'bg-blue-100 border-blue-400 text-blue-800',
  WAITING_PARTS: 'bg-yellow-100 border-yellow-400 text-yellow-800',
  PARTS_ARRIVED: 'bg-purple-100 border-purple-400 text-purple-800',
  READY_FOR_RELEASE: 'bg-green-100 border-green-400 text-green-800',
  OTHER: 'bg-stone-200 border-stone-400 text-stone-700',
};

const STATUS_ORDER = ['READY_FOR_RELEASE', 'PARTS_ARRIVED', 'WAITING_PARTS', 'IN_WORK', 'OTHER', ''];

function PainterQuickView({ row, onClose }: { row: PainterRow; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const carLine = carLineFor(row);
  const statusLabel = row.painter_status === 'OTHER'
    ? (row.painter_status_other_text?.trim() || 'אחר')
    : row.painter_status
      ? PAINTER_STATUS_LABELS[row.painter_status]
      : 'ללא סטטוס פחח';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        dir="rtl"
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          {row.license_plate ? <LicensePlate plate={row.license_plate} size="md" /> : <span />}
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {row.customer_name && <p className="text-lg font-bold text-gray-900">{row.customer_name}</p>}
          {row.case_key && <p className="text-sm text-gray-500">#{row.case_key}</p>}
          {carLine && <p className="text-sm text-gray-600">{carLine}</p>}

          <div>
            <p className="text-xs text-gray-400 mb-1">סטטוס</p>
            <span className="inline-block px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-semibold">
              {statusLabel}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            {row.appraiser_name && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">שמאי</p>
                <p className="text-sm text-gray-700">{row.appraiser_name}</p>
              </div>
            )}
            {row.branch_name && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">סניף</p>
                <p className="text-sm text-gray-700">{row.branch_name}</p>
              </div>
            )}
            {row.opened_at && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">נפתח בתאריך</p>
                <p className="text-sm text-gray-700">{formatDate(row.opened_at)}</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
          <Link
            href={`/painters/${row.id}`}
            className="flex items-center justify-center gap-1.5 w-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
          >
            מעבר לתיק ←
          </Link>
        </div>
      </div>
    </div>
  );
}

export function PaintersBoard({ rows }: { rows: PainterRow[] }) {
  // Layout redone 2026-10-08 (Tomer, viewing as CEO): four boxes, each with
  // its own inner scroll, put 35 "בעבודה" cases in a small scrolling box and
  // gave no overview and no way to switch branch. Same grouping by status,
  // shown as: branch tabs → one strip of status counts (tap = show only that
  // status) → full-height sections with one compact row per case.
  const [selected, setSelected] = useState<PainterRow | null>(null);
  const [branch, setBranch] = useState('all');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const branchNames = Array.from(new Set(rows.map((r) => r.branch_name).filter((b): b is string => !!b))).sort((a, b) => a.localeCompare(b, 'he'));
  const inBranch = branch === 'all' ? rows : rows.filter((r) => r.branch_name === branch);

  const groups: Record<string, PainterRow[]> = {
    READY_FOR_RELEASE: [], PARTS_ARRIVED: [], WAITING_PARTS: [], IN_WORK: [], OTHER: [], '': [],
  };
  for (const row of inBranch) {
    const key = row.painter_status ?? '';
    (groups[key] ?? groups['']).push(row);
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => (b.opened_at ?? '').localeCompare(a.opened_at ?? '')); // newest first
  }

  const statusKeys = STATUS_ORDER.filter((k) => k !== '' || groups[''].length > 0);
  const shownKeys = (statusFilter !== null ? [statusFilter] : statusKeys).filter((k) => groups[k].length > 0);
  const labelFor = (k: string) => (k ? PAINTER_STATUS_LABELS[k] : 'ללא סטטוס פחח');
  const headFor = (k: string) => (k ? PAINTER_STATUS_COLUMN_HEAD[k] : 'bg-gray-100 border-gray-300 text-gray-600');
  const iconFor = (k: string) => (k ? PAINTER_STATUS_ICON[k] : '⚪');

  return (
    <div className="space-y-4">
      {/* Branch tabs */}
      {branchNames.length > 1 && (
        <SegmentedControl
          options={[
            { value: 'all', label: `הכל (${rows.length})` },
            ...branchNames.map((b) => ({ value: b, label: `${b} (${rows.filter((r) => r.branch_name === b).length})` })),
          ]}
          value={branch}
          onChange={(v) => setBranch(v)}
        />
      )}

      {/* Status strip: the overview at a glance; tap to show only that status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {statusKeys.map((k) => {
          const active = statusFilter === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setStatusFilter(active ? null : k)}
              aria-pressed={active}
              className={`flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-right transition-all ${headFor(k)} ${
                active ? 'ring-2 ring-offset-2 ring-gray-800' : statusFilter !== null ? 'opacity-50 hover:opacity-80' : 'hover:shadow-sm'
              }`}
            >
              <span className="text-sm font-bold flex items-center gap-1.5 min-w-0">
                <span>{iconFor(k)}</span>
                <span className="truncate">{labelFor(k)}</span>
              </span>
              <span className="text-lg font-extrabold tabular-nums">{groups[k].length}</span>
            </button>
          );
        })}
      </div>
      {statusFilter !== null && (
        <button type="button" onClick={() => setStatusFilter(null)} className="text-sm text-blue-600 hover:underline">
          ← הצג את כל הסטטוסים
        </button>
      )}

      {/* Sections — full height, no inner scroll */}
      {shownKeys.length === 0 && <p className="text-sm text-gray-400 text-center py-10">אין תיקים</p>}
      {shownKeys.map((k) => (
        <section key={k} className="space-y-2">
          <h2 className={`sticky top-[env(safe-area-inset-top,0px)] z-10 flex items-center justify-between rounded-lg border-b-2 px-3 py-2 text-sm font-bold ${headFor(k)}`}>
            <span className="flex items-center gap-1.5"><span>{iconFor(k)}</span>{labelFor(k)}</span>
            <span className="text-xs bg-black/10 px-2 py-0.5 rounded-full tabular-nums">{groups[k].length}</span>
          </h2>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {groups[k].map((row) => {
              const carLine = carLineFor(row);
              return (
                <button
                  type="button"
                  key={row.id}
                  onClick={() => setSelected(row)}
                  className="flex items-center gap-3 w-full text-right bg-white rounded-lg border border-gray-200 px-3 py-2 hover:border-brand-red/40 hover:shadow-sm transition-all"
                >
                  {row.license_plate && <LicensePlate plate={row.license_plate} size="sm" />}
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-gray-900 text-sm truncate">{row.customer_name ?? '—'}</span>
                    <span className="block text-[11px] text-gray-500 truncate">
                      {[carLine, branch === 'all' ? row.branch_name : null, row.opened_at ? formatDate(row.opened_at) : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {selected && <PainterQuickView row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
