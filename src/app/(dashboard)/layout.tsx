import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { UserRole } from '@/types/database';
import { PreviewRoleSwitcher } from '@/components/preview/PreviewRoleSwitcher';
import { NotificationsBell } from '@/components/NotificationsBell';
import { PushEnableBanner } from '@/components/PushEnableBanner';
import { SidebarNav } from '@/components/SidebarNav';
import { LogOut, Eye } from 'lucide-react';
import { getViewAsState } from '@/app/actions/users';
import { StopViewAsButton } from './StopViewAsButton';

const ROLE_LINKS: Record<UserRole, { label: string; href: string }[]> = {
  SERVICE_MANAGER: [
    { label: 'תיקים', href: '/cases' },
    { label: 'ארכיון', href: '/cases/archive' },
    { label: 'תוספות', href: '/extras' },
    { label: 'התראות', href: '/notifications' },
  ],
  OFFICE: [
    { label: 'סגירה', href: '/closure' },
    { label: 'הפניות', href: '/referrals' },
    { label: 'ארכיון', href: '/cases/archive' },
    { label: 'התראות', href: '/notifications' },
  ],
  CEO: [
    { label: 'תיקים', href: '/cases' },
    { label: 'אישורים', href: '/approvals' },
    { label: 'סגירה', href: '/closure' },
    { label: 'הפניות', href: '/referrals' },
    { label: 'פחחים', href: '/painters' },
    { label: 'התראות', href: '/notifications' },
    { label: 'ארכיון', href: '/cases/archive' },
    { label: 'הגדרות', href: '/settings' },
  ],
  PAINTER: [
    { label: 'תיקים', href: '/painters' },
    { label: 'תוספת חדשה', href: '/extras/new' },
    { label: 'התוספות שלי', href: '/extras/mine' },
    { label: 'התראות', href: '/notifications' },
  ],
  SERVICE_ADVISOR: [
    { label: 'תיקים', href: '/cases' },
    { label: 'ארכיון', href: '/cases/archive' },
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
    .select('full_name, role, branch_id, is_active')
    .eq('id', user.id)
    .single();

  const profile = profileData as { full_name?: string; role: string; branch_id: string | null; is_active?: boolean } | null;
  const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true';

  // Mid-session deactivation: if a CEO disabled this account, kick them out
  // even though their Supabase session is still technically valid.
  if (!isPreview && profile && profile.is_active === false) {
    await supabase.auth.signOut();
    redirect('/login');
  }

  const actualRole = (profile?.role as UserRole) ?? 'SERVICE_ADVISOR';

  // "View as" preview — CEO previewing another user's UI.
  const viewAs = actualRole === 'CEO' ? await getViewAsState() : null;
  const role: UserRole = viewAs?.role ?? actualRole;

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

      {/* "View as" banner — CEO previewing another user's UI */}
      {viewAs && (
        <div className="bg-purple-100 border-b border-purple-300 px-4 py-2 flex items-center justify-center gap-3 text-sm text-purple-900">
          <Eye size={14} />
          <span>
            את/ה צופ/ה בתצוגה של <strong>{viewAs.userName}</strong> ({ROLE_LABEL[viewAs.role]})
          </span>
          <StopViewAsButton />
        </div>
      )}

      {/* Prominent push-enable nudge — shows for anyone not yet subscribed */}
      {!isPreview && <PushEnableBanner />}

      {/* Top header with brand + nav + user */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        {/* Upper row: brand + user info */}
        <div className="px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          {/* Right side (in RTL): role badge + name + bell + logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-sm min-w-0 flex-1">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-2 sm:px-3 py-1.5 rounded-lg min-w-0">
              {/* Role label hidden on mobile to save space; name only */}
              <span className="text-gray-400 text-xs hidden sm:inline">{roleLabel}</span>
              <span className="text-gray-300 text-xs hidden sm:inline">·</span>
              <span className="font-semibold text-gray-800 text-xs sm:text-sm truncate max-w-[120px] sm:max-w-none">
                {profile?.full_name ?? user.email}
              </span>
              {branchName !== '—' && (
                <>
                  <span className="text-gray-300 text-xs hidden sm:inline">·</span>
                  <span className="text-gray-500 text-xs hidden sm:inline">{branchName}</span>
                </>
              )}
            </div>
            <NotificationsBell userId={user.id} />
            <a href="/logout" className="bg-gray-50 hover:bg-gray-100 border border-gray-200 p-2 rounded-lg transition-colors flex items-center shrink-0" title="התנתק">
              <LogOut size={16} className="text-gray-500" />
            </a>
          </div>

          {/* Left side: Logo/branding — full on desktop, compact on mobile */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xl sm:text-2xl font-black text-primary-container tracking-tight">תהילה</span>
            <span className="text-xs text-gray-400 font-medium hidden sm:inline">ניהול מוסך</span>
          </div>
        </div>

        {/* Lower row: horizontal nav — scrolls on mobile */}
        <div className="px-3 sm:px-6 border-t border-gray-100 bg-gray-50">
          <div className="py-2">
            <SidebarNav links={links} />
          </div>
        </div>
      </header>

      {/* Main content — no more sidebar */}
      <main className="flex-1 p-3 sm:p-6 bg-surface min-h-screen overflow-x-hidden">{children}</main>
    </div>
  );
}
