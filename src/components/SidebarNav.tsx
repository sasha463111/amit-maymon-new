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
            className={`px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center gap-3 border-r-4 ${
              isActive
                ? 'bg-red-600/10 text-red-500 border-red-500'
                : 'text-gray-400 border-transparent hover:bg-gray-800 hover:text-white'
            }`}
          >
            {Icon && (
              <Icon
                size={17}
                className={`flex-shrink-0 transition-colors ${
                  isActive ? 'text-red-500' : 'text-gray-500 group-hover:text-white'
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
