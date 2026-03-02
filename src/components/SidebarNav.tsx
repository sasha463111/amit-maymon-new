'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SIDEBAR_ICONS: Record<string, string> = {
  '/cases': '📋',
  '/closure': '🔒',
  '/approvals': '✅',
  '/extras': '🎨',
  '/extras/new': '🎨',
  '/extras/mine': '🎨',
  '/notifications': '🔔',
  '/settings': '⚙️',
};

export function SidebarNav({ links }: { links: { label: string; href: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {links.map(({ label, href }) => {
        const isActive =
          pathname === href ||
          (href.length > 1 && pathname.startsWith(href + '/'));
        const icon = SIDEBAR_ICONS[href] ?? '→';
        return (
          <Link
            key={href}
            href={href}
            className={`px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center gap-2 group border-r-4 ${
              isActive
                ? 'bg-brand-red/10 text-brand-red border-brand-red'
                : 'text-gray-700 border-transparent hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <span className={`transition-transform ${isActive ? '' : 'group-hover:scale-110'}`}>
              {icon}
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
