import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { UserRole } from '@/types/database';
import { PreviewRoleSwitcher } from '@/components/preview/PreviewRoleSwitcher';
import { NotificationsBadge } from '@/components/NotificationsBadge';
import { SidebarNav } from '@/components/SidebarNav';
import { Logo } from '@/components/Logo';
import { Bell, LogOut } from 'lucide-react';

const ROLE_LINKS: Record<UserRole, { label: string; href: string }[]> = {
  SERVICE_MANAGER: [
    { label: 'תיקים', href: '/cases' },
    { label: 'תוספות', href: '/extras' },
    { label: 'התראות', href: '/notifications' },
  ],
  OFFICE: [
    { label: 'סגירה', href: '/closure' },
    { label: 'התראות', href: '/notifications' },
  ],
  CEO: [
    { label: 'אישורים', href: '/approvals' },
    { label: 'סגירה', href: '/closure' },
    { label: 'תיקים', href: '/cases' },
    { label: 'פחחים', href: '/painters' },
    { label: 'התראות', href: '/notifications' },
    { label: 'הגדרות', href: '/settings' },
  ],
  PAINTER: [
    { label: 'תוספת חדשה', href: '/extras/new' },
    { label: 'התוספות שלי', href: '/extras/mine' },
    { label: 'התראות', href: '/notifications' },
  ],
  SERVICE_ADVISOR: [
    { label: 'תיקים', href: '/cases' },
    { label: 'התראות', href: '/notifications' },
  ],
};

const ROLE_LABEL: Record<UserRole, string> = {
  SERVICE_MANAGER: 'מנהל שירות',
  OFFICE: 'משרד',
  CEO: 'מנכ"ל',
  PAINTER: 'פחח',
  SERVICE_ADVISOR: 'יועצת שירות',
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name, role, branch_id')
    .eq('id', user.id)
    .single();

  const profile = profileData as { full_name?: string; role: string; branch_id: string | null } | null;
  const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true';
  const role = (profile?.role as UserRole) ?? 'SERVICE_ADVISOR';
  const links = isPreview
    ? [
        { label: 'תיקים', href: '/cases' },
        { label: 'סגירה', href: '/closure' },
        { label: 'אישורים', href: '/approvals' },
        { label: 'תוספות', href: '/extras' },
        { label: 'התראות', href: '/notifications' },
      ]
    : ROLE_LINKS[role];
  const roleLabel = ROLE_LABEL[role];

  let branchName = '—';
  if (profile?.branch_id) {
    const { data: branchData } = await supabase
      .from('branches')
      .select('name')
      .eq('id', profile.branch_id)
      .single();
    const branch = branchData as { name: string } | null;
    branchName = branch?.name ?? '—';
  }

  return (
    <div className="min-h-screen flex flex-col">
      {isPreview && (
        <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 text-center text-sm text-amber-900">
          מצב תצוגה מקדימה — ללא התחברות וללא מסד נתונים. הנתונים להמחשה בלבד.
        </div>
      )}
      {isPreview && <PreviewRoleSwitcher />}
      <header className="bg-brand-dark border-b border-brand-red/60 text-white px-6 h-16 flex items-center shadow-md">
        <div className="flex items-center justify-between w-full">
          <Logo variant="header" />
          {/* Right side: role badge + name + bell + logout */}
          <div className="flex items-center gap-2 text-sm">
            <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg">
              <span className="text-white/50 text-xs">{roleLabel}</span>
              <span className="text-white/20 text-xs">·</span>
              <span className="font-medium text-white">{profile?.full_name ?? user.email}</span>
            </div>
            <Link
              href="/notifications"
              className="relative bg-white/10 hover:bg-white/20 p-2 rounded-lg transition-colors"
              title="התראות"
            >
              <Bell size={17} className="text-white/80" />
              <NotificationsBadge userId={user.id} />
            </Link>
            <a href="/logout" className="bg-white/10 hover:bg-white/20 p-2 rounded-lg transition-colors flex items-center" title="התנתק">
              <LogOut size={16} className="text-white/80" />
            </a>
          </div>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="w-56 border-l border-gray-200 bg-white pt-4 px-2 pb-4 flex flex-col gap-1 shadow-sm">
          <SidebarNav links={links} />
        </aside>
        <main className="flex-1 p-6 bg-gray-50 min-h-screen">{children}</main>
      </div>
    </div>
  );
}
