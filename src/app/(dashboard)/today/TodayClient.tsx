'use client';

import Link from 'next/link';
import { LicensePlate } from '@/components/ui/LicensePlate';
import { ROLE_TABS, type TodayCard, type TodayRole } from '@/lib/todayTypes';

// "מה מחכה לי היום" (Amit, 15/10). Phone: two big cards per row, tap to open.
// Computer: a wider grid, and every card also previews its first items, so the
// big screen isn't wasted. The side stripe says how urgent it is.

const TONE: Record<TodayCard['tone'], string> = {
  late: 'border-s-red-500',
  warn: 'border-s-amber-500',
  ok: 'border-s-green-500',
  info: 'border-s-gray-300',
};

function greeting() {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false }));
  return h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : 'ערב טוב';
}

export function TodayClient({ role, cards, name, preview }: { role: TodayRole; cards: TodayCard[]; name: string; preview: boolean }) {
  const roleLabel = ROLE_TABS.find(([k]) => k === role)?.[1] ?? '';
  return (
    <div className="max-w-7xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-gray-500">{greeting()}</p>
          <h1 className="text-2xl font-extrabold text-gray-900">{!preview || role === 'ceo' ? `${name}, זה מה שמחכה לך היום` : `ככה נראה המסך של ${roleLabel}`}</h1>
        </div>
      </div>

      {preview && (
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {ROLE_TABS.map(([k, l]) => (
          <Link
            key={k}
            href={k === 'ceo' ? '/today' : `/today?as=${k}`}
            className={`whitespace-nowrap h-9 px-3 inline-flex items-center rounded-full border text-sm font-semibold ${role === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300 text-gray-700'}`}
          >
            {l}
          </Link>
        ))}
      </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.key} className={`rounded-2xl border border-gray-200 border-s-4 ${TONE[c.tone]} bg-white flex flex-col ${c.wide ? 'col-span-2 md:col-span-3 xl:col-span-4' : ''}`}>
            <Link href={c.href} className="block p-3 md:p-4 hover:bg-gray-50 rounded-t-2xl">
              <span className="block text-3xl md:text-4xl font-black text-gray-900 tabular-nums leading-tight">{c.num}</span>
              <span className="block text-sm font-semibold text-gray-700 leading-snug mt-0.5">{c.label}</span>
            </Link>
            {c.items && c.items.length > 0 && (
              <ul className={`${preview ? 'hidden md:block' : 'block'} border-t border-gray-100 px-3 py-2 space-y-1.5 flex-1`}>
                {c.items.map((it, i) => {
                  const row = (
                    <span className="flex items-center gap-2 min-w-0">
                      {it.plate ? <LicensePlate plate={it.plate} size="sm" className="shrink-0" /> : null}
                      <span className="min-w-0">
                        <span className="block text-[13px] text-gray-900 truncate">{it.title}</span>
                        {it.sub && <span className="block text-[11px] text-gray-500 truncate">{it.sub}</span>}
                      </span>
                    </span>
                  );
                  return (
                    <li key={i}>
                      {it.href ? (
                        <Link href={it.href} className="block rounded-lg hover:bg-gray-50 -mx-1 px-1 py-0.5">
                          {row}
                        </Link>
                      ) : (
                        row
                      )}
                    </li>
                  );
                })}
                <li>
                  <Link href={c.href} className="text-[12px] text-indigo-700 font-semibold">לכל הרשימה ←</Link>
                </li>
              </ul>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-500">
        {preview ? 'כל לשונית מראה את המסך של התפקיד הזה (לעובד — רק מה ששייך לו ולסניף שלו).' : 'כל כרטיס פותח את המסך המלא.'}
      </p>
    </div>
  );
}
