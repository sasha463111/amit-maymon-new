'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, KeyRound, LogOut, MoreHorizontal, X } from 'lucide-react';
import { NAV_ICONS, cleanLabel, isActiveHref } from './SidebarNav';

// Phone navigation (16/10, design round): 4 fixed tabs at the bottom, per role,
// with icon + label, and "עוד" for everything else — instead of a menu row
// that scrolls sideways at the top of the screen (Apple HIG tab bars, NN/g).

type NavLink = { label: string; href: string };

const TABS: Record<string, string[]> = {
  CEO: ['/today', '/cases', '/approvals', '/messages'],
  SERVICE_MANAGER: ['/today', '/cases', '/returns', '/messages'],
  SERVICE_ADVISOR: ['/today', '/cases', '/returns', '/messages'],
  OFFICE: ['/today', '/cases', '/referrals', '/messages'],
  PAINTER: ['/today', '/painters', '/returns', '/messages'],
  WAREHOUSE: ['/today', '/returns', '/messages', '/notifications'],
  WAREHOUSE_MANAGER: ['/today', '/returns', '/messages', '/notifications'],
  ACCOUNTANT: ['/today', '/finance', '/collections', '/messages'],
  COLLECTIONS: ['/today', '/collections', '/legal', '/messages'],
  DRIVER: ['/today', '/loaners', '/notifications', '/requests'],
};

export function BottomNav({ role, links, badges = {} }: { role: string; links: NavLink[]; badges?: Record<string, number> }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [pathname]);

  const byHref = new Map(links.map((l) => [l.href, l]));
  const tabs: NavLink[] = (TABS[role] ?? []).map((h) => byHref.get(h)).filter((l): l is NavLink => !!l);
  for (const l of links) if (tabs.length < 4 && !tabs.includes(l) && l.href !== '/notifications') tabs.push(l);
  const rest = links.filter((l) => !tabs.includes(l));
  const moreActive = rest.some((l) => isActiveHref(pathname, l.href));
  const moreBadge = rest.reduce((s, l) => s + (badges[l.href] ?? 0), 0);

  return (
    <>
      <nav aria-label="ניווט ראשי" className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]" dir="rtl">
        <div className="grid grid-cols-5 h-16">
          {tabs.map((l) => {
            const Icon = (l.href === '/notifications' ? Bell : NAV_ICONS[l.href]) as React.ElementType | undefined;
            const active = isActiveHref(pathname, l.href);
            const n = badges[l.href] ?? 0;
            return (
              <Link key={l.href} href={l.href} aria-current={active ? 'page' : undefined} className={`relative flex flex-col items-center justify-center gap-0.5 text-[11px] ${active ? 'text-brand-red font-bold' : 'text-gray-600'}`}>
                {Icon && <Icon size={23} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />}
                <span className="truncate max-w-full px-1">{cleanLabel(l.label, true)}</span>
                {n > 0 && <span className="absolute top-1.5 left-1/2 -translate-x-[18px] min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">{n}</span>}
              </Link>
            );
          })}
          <button type="button" onClick={() => setMore(true)} aria-expanded={more} className={`relative flex flex-col items-center justify-center gap-0.5 text-[11px] ${moreActive ? 'text-brand-red font-bold' : 'text-gray-600'}`}>
            <MoreHorizontal size={23} aria-hidden="true" />
            <span>עוד</span>
            {moreBadge > 0 && <span className="absolute top-1.5 left-1/2 -translate-x-[18px] min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">{moreBadge}</span>}
          </button>
        </div>
      </nav>

      {more && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setMore(false)} dir="rtl">
          <div className="w-full bg-white rounded-t-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-lg font-bold text-gray-900">כל המסכים</p>
              <button type="button" onClick={() => setMore(false)} aria-label="סגירה" className="w-11 h-11 rounded-full hover:bg-gray-100 flex items-center justify-center">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {rest.map((l) => {
                const Icon = (l.href === '/notifications' ? Bell : NAV_ICONS[l.href]) as React.ElementType | undefined;
                const active = isActiveHref(pathname, l.href);
                const n = badges[l.href] ?? 0;
                return (
                  <Link key={l.href} href={l.href} className={`relative min-h-[84px] rounded-2xl border p-2 flex flex-col items-center justify-center gap-1.5 text-center text-[13px] font-semibold ${active ? 'border-brand-red bg-red-50 text-brand-red' : 'border-gray-200 text-gray-800'}`}>
                    {Icon && <Icon size={24} aria-hidden="true" />}
                    <span className="leading-tight">{cleanLabel(l.label, true)}</span>
                    {n > 0 && <span className="absolute top-1.5 left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">{n}</span>}
                  </Link>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2">
              <a href="/account/password" className="h-12 rounded-xl border border-gray-200 flex items-center justify-center gap-2 text-sm text-gray-800">
                <KeyRound size={17} aria-hidden="true" />
                החלפת סיסמה
              </a>
              <a href="/logout" className="h-12 rounded-xl border border-red-200 text-red-700 flex items-center justify-center gap-2 text-sm">
                <LogOut size={17} aria-hidden="true" />
                יציאה
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
