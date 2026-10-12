'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PartReturnRow } from '@/app/actions/partReturns';
import { PART_RETURN_STATUS_LABEL } from '@/lib/partReturns';
import { formatDate } from '@/lib/dates';

/** Parts returned from this case — for the advisor at car release ("what to
 *  deduct from the original estimate", Amit 2026-10-12). Shown only when
 *  there are any; RLS decides who sees them. */
export function CasePartReturns({ rows }: { rows: PartReturnRow[] }) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  const qty = rows.reduce((s, r) => s + r.quantity, 0);
  return (
    <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-3" dir="rtl">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between text-right">
        <span className="font-bold text-amber-900">
          📦 {qty === 1 ? 'חלק אחד הוחזר' : `${qty} חלקים הוחזרו`} בתיק הזה — לזכות מהאומדן
        </span>
        <span className="text-sm text-amber-800">{open ? 'סגור ▴' : 'פרטים ▾'}</span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 bg-white rounded-lg border border-amber-200 px-3 py-2 text-sm">
              {r.photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.photo_url} alt="" className="w-10 h-10 object-cover rounded" />
              )}
              <span className="flex-1 min-w-0">
                <span className="font-semibold">{r.description || r.sku}</span>
                {r.quantity > 1 ? ` · כמות ${r.quantity}` : ''} · {r.supplier_label} · {r.reason_label}
                <span className="block text-xs text-gray-500">
                  {PART_RETURN_STATUS_LABEL[r.status] ?? r.status} · {formatDate(r.created_at)}
                  {r.credit_amount != null ? ` · זוכה ₪${r.credit_amount.toLocaleString('he-IL')}` : ''}
                </span>
              </span>
            </li>
          ))}
          <li>
            <Link href="/returns" className="text-xs text-amber-900 underline">למעקב ההחזרות ←</Link>
          </li>
        </ul>
      )}
    </div>
  );
}
