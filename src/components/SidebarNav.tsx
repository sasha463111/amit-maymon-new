'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderOpen, Lock, CheckSquare, Paintbrush, Bell, Settings, Plus, Users } from 'lucide-react';

const SIDEBAR_ICONS: Record<string, React.ElementType> = {
  '/cases': FolderOpen,
  '/closure': Lock,
  '/approvals': CheckSquare,
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
    <nav className="flex flex-col gap-0.5">
      {links.map(({ label, href }) => {
        const isActive =
          pathname === href ||
          (href.length > 1 && pathname.startsWith(href + '/'));
        const Icon = SIDEBAR_ICONS[href];
        return (
          <Link
            key={href}
            href={href}
            className={`px-3 py-3 rounded-lg text-base font-medium transition-all flex items-center gap-3 group border-r-[3px] ${
              isActive
                ? 'bg-red-50 text-brand-red border-brand-red'
                : 'text-gray-500 border-transparent hover:bg-gray-50 hover:text-gray-800'
            }`}
          >
            {Icon && (
              <Icon
                size={18}
                className={`flex-shrink-0 transition-colors ${
                  isActive ? 'text-brand-red' : 'text-gray-400 group-hover:text-gray-600'
                }`}
              />
            )}
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
