'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Archive,
  BarChart3,
  Bell,
  Bug,
  Car,
  CheckSquare,
  ChevronDown,
  DollarSign,
  FileText,
  FolderOpen,
  Home,
  Inbox,
  Lightbulb,
  Link2,
  Lock,
  Mail,
  Package,
  Paintbrush,
  Plus,
  Rocket,
  Scale,
  Settings,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';

// The top navigation. An icon on every item (Tomer, 15/10: "כל ה-nav items עם
// סמלים"), and — for a long menu (the CEO has ~20) — groups that open as a
// dropdown, so everything fits without scrolling sideways.

export const NAV_ICONS: Record<string, React.ElementType> = {
  '/today': Home,
  '/dashboards': BarChart3,
  '/cases': FolderOpen,
  '/cases/archive': Archive,
  '/closure': Lock,
  '/approvals': CheckSquare,
  '/referrals': Link2,
  '/loaners': Car,
  '/extras': Paintbrush,
  '/extras/new': Plus,
  '/extras/mine': Paintbrush,
  '/painters': Users,
  '/messages': Mail,
  '/mail': Inbox,
  '/returns': Package,
  '/collections': ShieldCheck,
  '/legal': Scale,
  '/finance': DollarSign,
  '/receivables': TrendingUp,
  '/notifications': Bell,
  '/settings': Settings,
  '/requests': Lightbulb,
  '/features': Rocket,
  '/bugs': Bug,
};

/** Groups for a long menu. Anything not listed stays as a direct item. */
const GROUPS: { title: string; icon: React.ElementType; hrefs: string[] }[] = [
  { title: 'תיקים', icon: FolderOpen, hrefs: ['/cases', '/approvals', '/closure', '/referrals', '/cases/archive'] },
  { title: 'מוסך', icon: Package, hrefs: ['/painters', '/returns', '/loaners', '/extras', '/extras/mine'] },
  { title: 'ביטוח וכספים', icon: DollarSign, hrefs: ['/collections', '/legal', '/finance', '/receivables'] },
  // "📊 דשבורדים" stays a direct item (Tomer 15/10), not inside ניהול.
  { title: 'ניהול', icon: Settings, hrefs: ['/requests', '/bugs', '/features', '/settings'] },
];
const GROUP_FROM = 9; // a menu longer than this is grouped

// "🏠 היום" → "היום" when there is an icon (no double symbols).
export const cleanLabel = (label: string, hasIcon: boolean) => (hasIcon ? label.replace(/^[^A-Za-z0-9֐-׿]+\s*/, '') : label);

type NavLink = { label: string; href: string };

export function isActiveHref(pathname: string, href: string) {
  return pathname === href || (href !== '/cases' && href.length > 1 && pathname.startsWith(href + '/')) || (href === '/cases' && pathname === '/cases');
}

function Badge({ n, active }: { n: number; active: boolean }) {
  if (!n) return null;
  return (
    <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center ${active ? 'bg-white text-red-600' : 'bg-red-600 text-white'}`}>{n}</span>
  );
}

function Item({ link, active, badge, wide = false }: { link: NavLink; active: boolean; badge: number; wide?: boolean }) {
  const Icon = NAV_ICONS[link.href];
  return (
    <Link
      href={link.href}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${wide ? 'w-full' : ''} ${
        active ? 'bg-red-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {Icon && <Icon size={16} className="flex-shrink-0" />}
      <span>{cleanLabel(link.label, !!Icon)}</span>
      <Badge n={badge} active={active} />
    </Link>
  );
}

function Group({ title, icon: Icon, links, pathname, badges }: { title: string; icon: React.ElementType; links: NavLink[]; pathname: string; badges: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = links.some((l) => isActiveHref(pathname, l.href));
  const activeLink = links.find((l) => isActiveHref(pathname, l.href));
  const count = links.reduce((s, l) => s + (badges[l.href] ?? 0), 0);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
          active ? 'bg-red-600 text-white shadow-sm' : open ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        <Icon size={16} className="flex-shrink-0" />
        {/* The open page's name inside the group, so you see where you are. */}
        <span>{activeLink ? cleanLabel(activeLink.label, true) : title}</span>
        <Badge n={count} active={active} />
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 z-50 min-w-[220px] rounded-xl border border-gray-200 bg-white shadow-lg p-1.5 space-y-0.5">
          <p className="px-3 pt-1 pb-1.5 text-[11px] font-bold text-gray-400">{title}</p>
          {links.map((l) => (
            <Item key={l.href} link={l} active={isActiveHref(pathname, l.href)} badge={badges[l.href] ?? 0} wide />
          ))}
        </div>
      )}
    </div>
  );
}

export function SidebarNav({ links: allLinks, badges = {} }: { links: NavLink[]; badges?: Record<string, number> }) {
  const pathname = usePathname();
  // "התראות" is the bell in the header (with "לכל ההתראות") — not a second
  // time in the menu (Tomer 15/10: "למה ההתראות מופיע פעמיים?").
  const links = allLinks.filter((l) => l.href !== '/notifications');

  // A short menu: every item directly, with its icon.
  if (links.length < GROUP_FROM) {
    return (
      <nav className="flex items-center gap-1 overflow-x-auto">
        {links.map((l) => (
          <Item key={l.href} link={l} active={isActiveHref(pathname, l.href)} badge={badges[l.href] ?? 0} />
        ))}
      </nav>
    );
  }

  // A long menu: direct items (anything not in a group, in their order), then the groups.
  const grouped = new Set(GROUPS.flatMap((g) => g.hrefs));
  const direct = links.filter((l) => !grouped.has(l.href));
  const groups = GROUPS.map((g) => ({ ...g, links: g.hrefs.map((h) => links.find((l) => l.href === h)).filter((l): l is NavLink => !!l) })).filter((g) => g.links.length);

  return (
    <nav className="flex items-center gap-1 flex-wrap md:flex-nowrap overflow-visible">
      {direct.map((l) => (
        <Item key={l.href} link={l} active={isActiveHref(pathname, l.href)} badge={badges[l.href] ?? 0} />
      ))}
      <span className="w-px h-6 bg-gray-200 mx-1 hidden md:block" />
      {groups.map((g) => (
        <Group key={g.title} title={g.title} icon={g.icon} links={g.links} pathname={pathname} badges={badges} />
      ))}
    </nav>
  );
}
