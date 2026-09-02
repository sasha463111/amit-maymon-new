'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderOpen, Lock, CheckSquare, Paintbrush, Bell, Settings, Plus, Users, Archive, Link2 } from 'lucide-react';

const NAV_ICONS: Record<string, React.ElementType> = {
  '/cases': FolderOpen,
  '/cases/archive': Archive,
  '/closure': Lock,
  '/approvals': CheckSquare,
  '/referrals': Link2,
  '/extras': Paintbrush,
  '/extras/new': Plus,
  '/extras/mine': Paintbrush,
  '/painters': Users,
  '/notifications': Bell,
  '/settings': Settings,
};

export function SidebarNav({ links }: { links: { label: string; href: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {links.map(({ label, href }) => {
        const isActive =
          pathname === href ||
          (href !== '/cases' && href.length > 1 && pathname.startsWith(href + '/')) ||
          (href === '/cases' && pathname === '/cases');
        const Icon = NAV_ICONS[href];
        return (
          <Link
            key={href}
            href={href}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
              isActive
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {Icon && <Icon size={16} className="flex-shrink-0" />}
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
