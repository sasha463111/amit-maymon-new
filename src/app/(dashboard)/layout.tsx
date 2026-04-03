import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { UserRole } from '@/types/database';
import { PreviewRoleSwitcher } from '@/components/preview/PreviewRoleSwitcher';
import { NotificationsBadge } from '@/components/NotificationsBadge';
import { SidebarNav } from '@/components/SidebarNav';
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
    <div className="min-h-screen flex flex-col bg-surface">
      {isPreview && (
        <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 text-center text-sm text-amber-900">
          מצב תצוגה מקדימה — ללא התחברות וללא מסד נתונים. הנתונים להמחשה בלבד.
        </div>
      )}
      {isPreview && <PreviewRoleSwitcher />}

      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 h-16 flex items-center shadow-sm sticky top-0 z-40">
        <div className="flex items-center justify-between w-full">
          {/* Right side: role badge + name + bell + logout */}
          <div className="flex items-center gap-2 text-sm">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg">
              <span className="text-gray-400 text-xs">{roleLabel}</span>
              <span className="text-gray-300 text-xs">·</span>
              <span className="font-semibold text-gray-800 text-sm">{profile?.full_name ?? user.email}</span>
              {branchName !== '—' && (
                <>
                  <span className="text-gray-300 text-xs">·</span>
                  <span className="text-gray-500 text-xs">{branchName}</span>
                </>
              )}
            </div>
            <Link
              href="/notifications"
              className="relative bg-gray-50 hover:bg-gray-100 border border-gray-200 p-2 rounded-lg transition-colors"
              title="התראות"
            >
              <Bell size={17} className="text-gray-500" />
              <NotificationsBadge userId={user.id} />
            </Link>
            <a href="/logout" className="bg-gray-50 hover:bg-gray-100 border border-gray-200 p-2 rounded-lg transition-colors flex items-center" title="התנתק">
              <LogOut size={16} className="text-gray-500" />
            </a>
          </div>

          {/* Left side: Logo/branding */}
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-primary-container tracking-tight">תהילה</span>
            <span className="text-xs text-gray-400 font-medium">ניהול מוסך</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar — dark theme */}
        <aside className="w-56 bg-gray-900 flex flex-col shadow-xl flex-shrink-0">
          <nav className="flex-1 px-3 py-4">
            <SidebarNav links={links} />
          </nav>
        </aside>

        <main className="flex-1 p-6 bg-surface min-h-screen overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
