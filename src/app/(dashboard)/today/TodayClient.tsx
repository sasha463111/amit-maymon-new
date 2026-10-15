'use client';

import Link from 'next/link';
import { Camera, Car, CheckSquare, FolderOpen, Lock, Plus, ShieldCheck, type LucideIcon } from 'lucide-react';
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

// The one main action of each role, big, right under the greeting (16/10,
// design round: "היום" is everyone's home page now, so the page each role used
// to land on is one tap away) + up to two secondary ones.
type Action = { label: string; href: string; icon: LucideIcon };
const ACTIONS: Record<TodayRole, { main: Action; more: Action[] }> = {
  ceo: { main: { label: 'אישורים ממתינים', href: '/approvals', icon: CheckSquare }, more: [{ label: 'תיקים', href: '/cases', icon: FolderOpen }] },
  advisor: { main: { label: 'לרשימת התיקים', href: '/cases', icon: FolderOpen }, more: [{ label: 'החזרת חלק', href: '/returns?new=1', icon: Camera }] },
  painter: { main: { label: 'תוספת חדשה', href: '/extras/new', icon: Plus }, more: [{ label: 'התיקים שלי', href: '/painters', icon: FolderOpen }, { label: 'החזרת חלק', href: '/returns?new=1', icon: Camera }] },
  office: { main: { label: 'סגירת תיקים', href: '/closure', icon: Lock }, more: [{ label: 'הפניות', href: '/referrals', icon: FolderOpen }, { label: 'רכב חליפי', href: '/loaners', icon: Car }] },
  warehouse: { main: { label: 'החזרה חדשה — צילום מדבקה', href: '/returns?new=1', icon: Camera }, more: [{ label: 'כל ההחזרות', href: '/returns', icon: FolderOpen }] },
  collections: { main: { label: 'תביעות ביטוח', href: '/collections', icon: ShieldCheck }, more: [{ label: 'טיפול משפטי', href: '/legal', icon: FolderOpen }] },
  driver: { main: { label: 'מסירת רכב חליפי', href: '/loaners?new=1', icon: Car }, more: [{ label: 'כל הרכבים', href: '/loaners', icon: FolderOpen }] },
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

      {(() => {
        const a = ACTIONS[role];
        if (!a) return null;
        const Main = a.main.icon;
        return (
          <div className="flex flex-col sm:flex-row gap-2">
            <Link href={a.main.href} className="h-14 px-6 rounded-2xl bg-brand-red hover:bg-brand-red-dark text-white text-lg font-bold inline-flex items-center justify-center gap-2.5 shadow-sm">
              <Main size={22} aria-hidden="true" />
              {a.main.label}
            </Link>
            <div className={`grid ${a.more.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} sm:flex gap-2`}>
              {a.more.map((m) => {
                const Icon = m.icon;
                return (
                  <Link key={m.href} href={m.href} className="h-14 px-4 rounded-2xl border-2 border-gray-200 bg-white hover:bg-gray-50 text-gray-800 font-semibold inline-flex items-center justify-center gap-2">
                    <Icon size={18} aria-hidden="true" />
                    {m.label}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })()}

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
