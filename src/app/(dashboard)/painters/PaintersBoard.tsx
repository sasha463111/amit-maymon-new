'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LicensePlate } from '@/components/ui/LicensePlate';

export interface PainterRow {
  id: string;
  case_key: string | null;
  customer_name: string | null;
  painter_status: string | null;
  appraiser_name: string | null;
  opened_at: string | null;
  license_plate: string | null;
  car_make: string | null;
  car_model: string | null;
  car_year: number | null;
  branch_name: string | null;
}

const PAINTER_STATUS_LABELS: Record<string, string> = {
  IN_WORK: 'בעבודה',
  WAITING_PARTS: 'ממתין לחלקים',
  PARTS_ARRIVED: 'הגיעו חלקים',
  READY_FOR_RELEASE: 'מוכן לשחרור',
};

const PAINTER_STATUS_ICON: Record<string, string> = {
  IN_WORK: '🔧',
  WAITING_PARTS: '⏳',
  PARTS_ARRIVED: '🎨',
  READY_FOR_RELEASE: '✅',
};

// Column header: colored fill + a bottom border in the deeper shade of the same hue.
const PAINTER_STATUS_COLUMN_HEAD: Record<string, string> = {
  IN_WORK: 'bg-blue-100 border-blue-400 text-blue-800',
  WAITING_PARTS: 'bg-yellow-100 border-yellow-400 text-yellow-800',
  PARTS_ARRIVED: 'bg-purple-100 border-purple-400 text-purple-800',
  READY_FOR_RELEASE: 'bg-green-100 border-green-400 text-green-800',
};

const STATUS_ORDER = ['READY_FOR_RELEASE', 'PARTS_ARRIVED', 'WAITING_PARTS', 'IN_WORK', ''];

function PainterQuickView({ row, onClose }: { row: PainterRow; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const carLine = [row.car_make, row.car_model, row.car_year].filter(Boolean).join(' ');
  const statusLabel = row.painter_status ? PAINTER_STATUS_LABELS[row.painter_status] : 'ללא סטטוס פחח';

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
                <p className="text-sm text-gray-700">{new Date(row.opened_at).toLocaleDateString('he-IL')}</p>
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
  const [selected, setSelected] = useState<PainterRow | null>(null);

  const groups: Record<string, PainterRow[]> = {
    READY_FOR_RELEASE: [], PARTS_ARRIVED: [], WAITING_PARTS: [], IN_WORK: [], '': [],
  };
  for (const row of rows) {
    const key = row.painter_status ?? '';
    (groups[key] ?? groups['']).push(row);
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {STATUS_ORDER.filter((k) => k !== '' || (groups['']?.length ?? 0) > 0).map((statusKey) => {
        const groupRows = groups[statusKey] ?? [];
        const label = statusKey ? PAINTER_STATUS_LABELS[statusKey] : 'ללא סטטוס פחח';
        const headCls = statusKey ? PAINTER_STATUS_COLUMN_HEAD[statusKey] : 'bg-gray-100 border-gray-300 text-gray-600';
        const icon = statusKey ? PAINTER_STATUS_ICON[statusKey] : '⚪';

        return (
          <div key={statusKey} className="rounded-xl border border-gray-200 bg-gray-50/40 flex flex-col min-h-[12rem]">
            <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl border-b-2 ${headCls}`}>
              <span className="text-sm font-bold flex items-center gap-1.5">
                <span>{icon}</span>
                {label}
              </span>
              <span className="text-xs font-bold bg-black/10 px-2 py-0.5 rounded-full">{groupRows.length}</span>
            </div>

            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-20rem)]">
              {groupRows.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">אין תיקים</p>
              ) : (
                groupRows.map((row) => {
                  const carLine = [row.car_make, row.car_model, row.car_year].filter(Boolean).join(' ');
                  return (
                    <button
                      type="button"
                      key={row.id}
                      onClick={() => setSelected(row)}
                      className="block w-full text-right bg-white rounded-lg border border-gray-200 shadow-sm p-3 hover:shadow-md hover:border-brand-red/30 transition-all"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-bold text-gray-900 text-sm truncate" title={row.customer_name ?? ''}>
                          {row.customer_name ?? '—'}
                        </span>
                        {row.license_plate && <LicensePlate plate={row.license_plate} size="sm" />}
                      </div>
                      {carLine && <p className="text-xs text-gray-500 mb-2">{carLine}</p>}
                      <div className="flex items-center justify-between text-[11px] text-gray-400 border-t border-gray-100 pt-1.5">
                        <span className="truncate max-w-[55%]">{row.appraiser_name ?? '—'}</span>
                        <span>
                          {row.branch_name && `${row.branch_name} · `}
                          {row.opened_at ? new Date(row.opened_at).toLocaleDateString('he-IL') : '—'}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );
      })}

      {selected && <PainterQuickView row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
