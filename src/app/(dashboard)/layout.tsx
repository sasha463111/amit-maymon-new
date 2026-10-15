import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { UserRole } from '@/types/database';
import { PreviewRoleSwitcher } from '@/components/preview/PreviewRoleSwitcher';
import { NotificationsBell } from '@/components/NotificationsBell';
import { CaseSearch } from '@/components/CaseSearch';
import { AutoRefresh } from '@/components/AutoRefresh';
import { SendReportButton } from '@/components/SendReportButton';
import { RealtimeProfileSync } from '@/components/RealtimeProfileSync';
import { PushEnableBanner } from '@/components/PushEnableBanner';
import { SidebarNav } from '@/components/SidebarNav';
import { jobLabel } from '@/lib/staffJobs';
import { canUsePartReturns } from '@/lib/partReturns';
import { LogOut, Eye, KeyRound } from 'lucide-react';
import { getViewAsState } from '@/app/actions/users';
import { StopViewAsButton } from './StopViewAsButton';
import { BRAND_NAME } from '@/lib/demo';
import { DemoBanner } from '@/components/DemoBanner';
import { PerfBeacon } from '@/components/PerfBeacon';
import { needsSmsCode } from '@/lib/loginVerify.server';

const ROLE_LINKS: Record<UserRole, { label: string; href: string }[]> = {
  SERVICE_MANAGER: [
    { label: 'תיקים', href: '/cases' },
    { label: 'הודעות', href: '/messages' },
    { label: 'החזרות', href: '/returns' },
    { label: 'ארכיון', href: '/cases/archive' },
    { label: 'תוספות', href: '/extras' },
    { label: 'התראות', href: '/notifications' },
  ],
  OFFICE: [
    // Cases too (2026-10-11): office staff complete paperwork / notes on cases
    // they opened; their edits show in the case history.
    { label: 'תיקים', href: '/cases' },
    { label: 'סגירה', href: '/closure' },
    { label: 'הודעות', href: '/messages' },
    { label: 'הפניות', href: '/referrals' },
    { label: 'רכב חליפי', href: '/loaners' },
    { label: 'ארכיון', href: '/cases/archive' },
    { label: 'התראות', href: '/notifications' },
  ],
  CEO: [
    { label: '🏠 היום', href: '/today' },
    { label: 'תיקים', href: '/cases' },
    { label: 'הודעות', href: '/messages' },
    { label: 'אישורים', href: '/approvals' },
    { label: 'סגירה', href: '/closure' },
    { label: 'הפניות', href: '/referrals' },
    { label: 'רכב חליפי', href: '/loaners' },
    { label: 'פחחים', href: '/painters' },
    { label: 'החזרות', href: '/returns' },
    { label: 'כספים', href: '/finance' },
    { label: 'ניהול תביעות ביטוח', href: '/collections' },
    { label: 'טיפול משפטי', href: '/legal' },
    { label: 'דשבורד גבייה', href: '/receivables' },
    { label: 'התראות', href: '/notifications' },
    { label: 'ארכיון', href: '/cases/archive' },
    { label: 'הגדרות', href: '/settings' },
    { label: '💡 הצעות ייעול', href: '/requests' },
    { label: '🐞 באגים', href: '/bugs' },
    { label: '🚀 פיתוחים', href: '/features' },
  ],
  PAINTER: [
    { label: 'תיקים', href: '/painters' },
    { label: 'הודעות', href: '/messages' },
    { label: 'החזרות', href: '/returns' },
    { label: 'התוספות שלי', href: '/extras/mine' },
    { label: 'התראות', href: '/notifications' },
  ],
  SERVICE_ADVISOR: [
    { label: 'תיקים', href: '/cases' },
    { label: 'הודעות', href: '/messages' },
    { label: 'החזרות', href: '/returns' },
    { label: 'ארכיון', href: '/cases/archive' },
    { label: 'התראות', href: '/notifications' },
  ],
  // Parts-returns module (2026-10-12): warehouse staff and Roei.
  WAREHOUSE: [
    { label: 'החזרות', href: '/returns' },
    { label: 'הודעות', href: '/messages' },
    { label: 'התראות', href: '/notifications' },
  ],
  WAREHOUSE_MANAGER: [
    { label: 'החזרות', href: '/returns' },
    { label: 'הודעות', href: '/messages' },
    { label: 'התראות', href: '/notifications' },
  ],
  // Bookkeeper (חני, 2026-10-14): returns, finance, collections (+ the
  // collections dashboard through finance_viewers).
  ACCOUNTANT: [
    { label: 'כספים', href: '/finance' },
    { label: 'ניהול תביעות ביטוח', href: '/collections' },
    { label: 'טיפול משפטי', href: '/legal' },
    { label: 'החזרות', href: '/returns' },
    { label: 'הודעות', href: '/messages' },
    { label: 'התראות', href: '/notifications' },
  ],
  // Claims collectors (2026-10-14): the collections screen only.
  COLLECTIONS: [
    { label: 'ניהול תביעות ביטוח', href: '/collections' },
    { label: 'טיפול משפטי', href: '/legal' },
    { label: 'הודעות', href: '/messages' },
    { label: 'התראות', href: '/notifications' },
  ],
  // Drivers (ינון, יצחק — Tomer, 15/10): the loaner-car module only.
  DRIVER: [
    { label: 'רכב חליפי', href: '/loaners' },
    { label: 'התראות', href: '/notifications' },
  ],
};

const ROLE_LABEL: Record<UserRole, string> = {
  SERVICE_MANAGER: 'מנהל שירות',
  OFFICE: 'משרד',
  CEO: 'מנכ"ל',
  PAINTER: 'פחח',
  SERVICE_ADVISOR: 'יועצת שירות',
  WAREHOUSE: 'מחסנאי',
  WAREHOUSE_MANAGER: 'מנהל מחסן',
  COLLECTIONS: 'מסלקת תביעות',
  ACCOUNTANT: 'מנהלת חשבונות',
  DRIVER: 'נהג',
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
    .select('full_name, role, branch_ids, is_active, office_function, mfa_required, sms_required, loaners_access')
    .eq('id', user.id)
    .single();

  const profile = profileData as { full_name?: string; role: string; branch_ids: string[]; is_active?: boolean; office_function?: string | null; mfa_required?: boolean; sms_required?: boolean; loaners_access?: boolean } | null;
  const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true';

  // Mid-session deactivation: if a CEO disabled this account, kick them out
  // even though their Supabase session is still technically valid.
  if (!isPreview && profile && profile.is_active === false) {
    await supabase.auth.signOut();
    redirect('/login');
  }

  // Two-step login (Amit, 15/10): whoever must use Duo and hasn't typed the
  // code in this session goes to /mfa (enrol once, then the code).
  if (!isPreview && profile?.mfa_required) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== 'aal2') redirect('/mfa');
  }
  // Login code by SMS (15/10): required + provider configured + this sign-in
  // not verified (and the phone not remembered) → /verify.
  if (!isPreview && (await needsSmsCode(supabase, user.id, !!profile?.sms_required))) redirect('/verify');

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
    : ROLE_LINKS[role].filter((l) => l.href !== '/returns' || canUsePartReturns(role));
  // "משרד הפניות" / "משרד סגירה" instead of a bare "משרד" (staffJobs.ts).
  const roleLabel = viewAs ? ROLE_LABEL[role] : jobLabel(role, profile?.office_function);

  // Unread notes/questions addressed to me — the badge on "הודעות". In
  // parallel: may I see the collections financial dashboard (CEO approved me)?
  const [{ count: unreadMessages }, { data: viewerRow }] = isPreview
    ? [{ count: 0 }, { data: null }]
    : await Promise.all([
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('type', 'DIRECT_NOTE')
          .eq('read', false),
        role === 'CEO' ? Promise.resolve({ data: null }) : supabase.from('finance_viewers').select('user_id').eq('user_id', user.id).maybeSingle(),
      ]);
  if (viewerRow && !links.some((l) => l.href === '/receivables')) links.push({ label: 'דשבורד גבייה', href: '/receivables' });
  // "רכב חליפי" for people given the module personally (profiles.loaners_access, 15/10).
  if (!isPreview && !viewAs && profile?.loaners_access && !links.some((l) => l.href === '/loaners')) links.push({ label: 'רכב חליפי', href: '/loaners' });
  // "💡 הערות לשיפור" for everyone (15/10); a CEO already has "הצעות ייעול".
  if (!isPreview && !links.some((l) => l.href === '/requests')) links.push({ label: '💡 הערות לשיפור', href: '/requests' });

  let branchName = '—';
  if (profile?.branch_ids && profile.branch_ids.length > 0) {
    // For OFFICE staff with multiple branches, show "כל הסניפים"
    // For single-branch, show branch name
    if (profile.branch_ids.length > 1) {
      branchName = 'כל הסניפים';
    } else {
      const { data: branchData } = await supabase
        .from('branches')
        .select('name')
        .eq('id', profile.branch_ids[0])
        .single();
      const branch = branchData as { name: string } | null;
      branchName = branch?.name ?? '—';
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Real-time sync for profile changes */}
      {!isPreview && <RealtimeProfileSync userId={user.id} />}
      {!isPreview && <AutoRefresh />}
      {/* Speed measurement, temporary (2026-10-13). */}
      {!isPreview && <PerfBeacon role={role} />}
      <DemoBanner />

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
            {!isPreview && <CaseSearch />}
            <NotificationsBell userId={user.id} role={actualRole} />
            <SendReportButton isCeo={actualRole === 'CEO'} />
            <a href="/account/password" className="bg-gray-50 hover:bg-gray-100 border border-gray-200 p-2 rounded-lg transition-colors flex items-center shrink-0" title="החלפת סיסמה">
              <KeyRound size={16} className="text-gray-500" />
            </a>
            <a href="/logout" className="bg-gray-50 hover:bg-gray-100 border border-gray-200 p-2 rounded-lg transition-colors flex items-center shrink-0" title="התנתק">
              <LogOut size={16} className="text-gray-500" />
            </a>
          </div>

          {/* Left side: Logo/branding — full on desktop, compact on mobile */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xl sm:text-2xl font-black text-primary-container tracking-tight">{BRAND_NAME}</span>
            <span className="text-xs text-gray-400 font-medium hidden sm:inline">ניהול מוסך</span>
          </div>
        </div>

        {/* Lower row: horizontal nav — scrolls on mobile */}
        <div className="px-3 sm:px-6 border-t border-gray-100 bg-gray-50">
          <div className="py-2">
            <SidebarNav links={links} badges={{ '/messages': unreadMessages ?? 0 }} />
          </div>
        </div>
      </header>

      {/* Main content — no more sidebar */}
      <main className="flex-1 p-3 sm:p-6 bg-surface min-h-screen overflow-x-hidden">{children}</main>
    </div>
  );
}
