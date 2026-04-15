'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { restoreCase } from '@/app/actions/workflow';
import { RotateCcw } from 'lucide-react';

type Row = {
  id: string;
  case_key: string;
  plate: string;
  claim: string;
  customer: string;
  opened_at: string | null;
  closed_at: string | null;
  deleted_at: string;
  deleted_by_name: string;
  branch_name: string;
};

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

export function ArchiveTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleRestore(row: Row) {
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

  return (
    <>
      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-4 py-3 text-right font-semibold">מספר רישוי</th>
                <th className="px-4 py-3 text-right font-semibold">שם לקוח</th>
                <th className="px-4 py-3 text-right font-semibold">מספר תביעה</th>
                <th className="px-4 py-3 text-right font-semibold">סניף</th>
                <th className="px-4 py-3 text-right font-semibold">נמחק בתאריך</th>
                <th className="px-4 py-3 text-right font-semibold">נמחק על-ידי</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-gray-800">{r.plate}</td>
                  <td className="px-4 py-3 text-gray-700">{r.customer}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.claim}</td>
                  <td className="px-4 py-3 text-gray-600">{r.branch_name}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(r.deleted_at)}</td>
                  <td className="px-4 py-3 text-gray-600">{r.deleted_by_name}</td>
                  <td className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleRestore(r)}
                      disabled={pending && restoringId === r.id}
                      className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors"
                    >
                      <RotateCcw size={12} />
                      {pending && restoringId === r.id ? 'משחזר…' : 'שחזר'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
