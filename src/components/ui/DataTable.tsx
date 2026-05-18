'use client';

import { useState } from 'react';
import { Search, ChevronUp, ChevronDown, InboxIcon } from 'lucide-react';

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  // Optional: prioritize this column on mobile card view. Higher = more important.
  mobilePriority?: number;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  searchKeys?: (keyof T)[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  // Optional: render a primary headline (e.g. customer name) for mobile cards
  mobileHeadline?: (row: T) => React.ReactNode;
  // Optional: render a subheadline (e.g. plate + claim) for mobile cards
  mobileSubheadline?: (row: T) => React.ReactNode;
}

export function DataTable<T extends object>({
  columns,
  data,
  searchPlaceholder = 'חיפוש...',
  searchKeys,
  rowKey,
  onRowClick,
  mobileHeadline,
  mobileSubheadline,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const rowRecord = (row: T) => row as Record<string, unknown>;

  let filtered = data;
  if (search && searchKeys && searchKeys.length > 0) {
    const s = search.toLowerCase();
    filtered = data.filter((row) =>
      searchKeys.some((k) => String(rowRecord(row)[k as string] ?? '').toLowerCase().includes(s))
    );
  }

  if (sortKey) {
    filtered = [...filtered].sort((a, b) => {
      const va = rowRecord(a)[sortKey];
      const vb = rowRecord(b)[sortKey];
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  return (
    <div className="space-y-0">
      {(searchKeys?.length ?? 0) > 0 && (
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative max-w-xs">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pr-9 pl-3 py-2 text-sm focus:border-brand-red focus:ring-2 focus:ring-brand-red/10 outline-none transition-all bg-gray-50 focus:bg-white"
            />
          </div>
        </div>
      )}
      {/* MOBILE: card view (hidden on md+) */}
      <div className="md:hidden divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400">
            <div className="flex flex-col items-center gap-2">
              <InboxIcon size={32} className="text-gray-300" />
              <span className="text-sm">לא נמצאו תוצאות</span>
            </div>
          </div>
        ) : (
          filtered.map((row) => {
            const r = row as T;
            return (
              <div
                key={rowKey(r)}
                onClick={() => onRowClick?.(r)}
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={`px-4 py-3 ${
                  onRowClick ? 'hover:bg-red-50/50 cursor-pointer active:bg-red-100/50' : ''
                }`}
              >
                {(mobileHeadline || mobileSubheadline) && (
                  <div className="mb-2">
                    {mobileHeadline && (
                      <div className="text-base font-semibold text-gray-900 leading-tight">
                        {mobileHeadline(r)}
                      </div>
                    )}
                    {mobileSubheadline && (
                      <div className="text-xs text-gray-500 mt-0.5">{mobileSubheadline(r)}</div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  {columns.map((col) => {
                    const cell = col.render ? col.render(r) : String(rowRecord(row)[col.key] ?? '');
                    // Skip empty cells in card view to reduce clutter
                    if (cell === null || cell === undefined || cell === '' || cell === '—') return null;
                    return (
                      <div key={col.key} className="min-w-0">
                        {col.label && (
                          <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">
                            {col.label}
                          </div>
                        )}
                        <div className="text-sm text-gray-700 truncate">{cell}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DESKTOP: table view (hidden below md) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead>
            <tr className="bg-gray-50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-5 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSortKey(sortKey === col.key ? sortKey : col.key);
                      setSortDir(
                        sortKey === col.key && sortDir === 'asc' ? 'desc' : 'asc'
                      );
                    }}
                    className="hover:text-gray-800 transition-colors flex items-center gap-1"
                  >
                    {col.label}
                    {sortKey === col.key && (
                      sortDir === 'asc'
                        ? <ChevronUp size={12} className="text-brand-red" />
                        : <ChevronDown size={12} className="text-brand-red" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <InboxIcon size={32} className="text-gray-300" />
                    <span className="text-sm">לא נמצאו תוצאות</span>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={rowKey(row as T)}
                  onClick={() => onRowClick?.(row as T)}
                  className={
                    onRowClick
                      ? 'hover:bg-red-50/50 cursor-pointer transition-colors border-r-2 border-r-transparent hover:border-r-brand-red'
                      : ''
                  }
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-5 py-4 text-sm text-gray-700">
                      {col.render
                        ? col.render(row as T)
                        : String(rowRecord(row)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
