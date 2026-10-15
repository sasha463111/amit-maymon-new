import { createClient } from '@/lib/supabase/server';
import { WhatsNewBanner } from '@/components/WhatsNewBanner';
import { listMyAnnouncements } from '@/app/actions/announcements';
import { redirect } from 'next/navigation';
import type { UserRole } from '@/types/database';
import { PreviewRoleSwitcher } from '@/components/preview/PreviewRoleSwitcher';
import { NotificationsBell } from '@/components/NotificationsBell';
import { CaseSearch } from '@/components/CaseSearch';
import { AutoRefresh } from '@/components/AutoRefresh';
import { UserMenu } from '@/components/UserMenu';
import { UpdateBanner } from '@/components/UpdateBanner';
import { DictationAssist } from '@/components/DictationAssist';
import { BottomNav } from '@/components/BottomNav';
import { RealtimeProfileSync } from '@/components/RealtimeProfileSync';
import { PushEnableBanner } from '@/components/PushEnableBanner';
import { SidebarNav } from '@/components/SidebarNav';
import { jobLabel } from '@/lib/staffJobs';
import { canUsePartReturns } from '@/lib/partReturns';
import { Eye } from 'lucide-react';
import { getViewAsState } from '@/app/actions/users';
import { StopViewAsButton } from './StopViewAsButton';
import { BRAND_NAME } from '@/lib/demo';
import { DemoBanner } from '@/components/DemoBanner';
import { PerfBeacon } from '@/components/PerfBeacon';
import { needsSmsCode } from '@/lib/loginVerify.server';

const ROLE_LINKS: Record<UserRole, { label: string; href: string }[]> = {
  SERVICE_MANAGER: [
    { label: '🏠 היום', href: '/today' }, // every role's own day (15/10)
    { label: 'תיקים', href: '/cases' },
    { label: 'הודעות', href: '/messages' },
    { label: 'החזרות', href: '/returns' },
    { label: 'ארכיון', href: '/cases/archive' },
    { label: 'תוספות', href: '/extras' },
    { label: 'התראות', href: '/notifications' },
  ],
  OFFICE: [
    { label: '🏠 היום', href: '/today' }, // every role's own day (15/10)
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
    { label: '📊 דשבורדים', href: '/dashboards' },
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
    { label: '🏠 היום', href: '/today' }, // every role's own day (15/10)
    { label: 'תיקים', href: '/painters' },
    { label: 'הודעות', href: '/messages' },
    { label: 'החזרות', href: '/returns' },
    { label: 'התוספות שלי', href: '/extras/mine' },
    { label: 'התראות', href: '/notifications' },
  ],
  SERVICE_ADVISOR: [
    { label: '🏠 היום', href: '/today' }, // every role's own day (15/10)
    { label: 'תיקים', href: '/cases' },
    { label: 'הודעות', href: '/messages' },
    { label: 'החזרות', href: '/returns' },
    { label: 'ארכיון', href: '/cases/archive' },
    { label: 'התראות', href: '/notifications' },
  ],
  // Parts-returns module (2026-10-12): warehouse staff and Roei.
  WAREHOUSE: [
    { label: '🏠 היום', href: '/today' }, // every role's own day (15/10)
    { label: 'החזרות', href: '/returns' },
    { label: 'הודעות', href: '/messages' },
    { label: 'התראות', href: '/notifications' },
  ],
  WAREHOUSE_MANAGER: [
    { label: '🏠 היום', href: '/today' }, // every role's own day (15/10)
    { label: 'החזרות', href: '/returns' },
    { label: 'הודעות', href: '/messages' },
    { label: 'התראות', href: '/notifications' },
  ],
  // Bookkeeper (חני, 2026-10-14): returns, finance, collections (+ the
  // collections dashboard through finance_viewers).
  ACCOUNTANT: [
    { label: '🏠 היום', href: '/today' }, // every role's own day (15/10)
    { label: 'כספים', href: '/finance' },
    { label: 'ניהול תביעות ביטוח', href: '/collections' },
    { label: 'טיפול משפטי', href: '/legal' },
    { label: 'החזרות', href: '/returns' },
    { label: 'הודעות', href: '/messages' },
    { label: 'התראות', href: '/notifications' },
  ],
  // Claims collectors (2026-10-14): the collections screen only.
  COLLECTIONS: [
    { label: '🏠 היום', href: '/today' }, // every role's own day (15/10)
    { label: 'ניהול תביעות ביטוח', href: '/collections' },
    { label: 'טיפול משפטי', href: '/legal' },
    { label: 'הודעות', href: '/messages' },
    { label: 'התראות', href: '/notifications' },
  ],
  // Drivers (ינון, יצחק — Tomer, 15/10): the loaner-car module only.
  DRIVER: [
    { label: '🏠 היום', href: '/today' }, // every role's own day (15/10)
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
  const announcements = isPreview ? [] : await listMyAnnouncements().catch(() => []);
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

      {/* A newer version is live → offer a refresh (16/10). */}
      {!isPreview && <UpdateBanner />}

      {/* One banner at a time (16/10, design round): "מה חדש" first; the
          push-enable nudge only when there is nothing new to announce. */}
      {!isPreview && !viewAs && announcements.length > 0 ? <WhatsNewBanner items={announcements} /> : !isPreview && <PushEnableBanner />}

      {/* Header (16/10): one clean row — brand, a wide search (Ctrl+K), the
          bell and one personal menu; the menu row below it on a computer. On a
          phone the menu is the bottom bar (BottomNav). */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="px-3 sm:px-6 h-14 md:h-16 flex items-center gap-2 sm:gap-3">
          <a href="/today" className="flex items-baseline gap-2 shrink-0">
            <span className="text-xl sm:text-2xl font-black text-primary-container tracking-tight">{BRAND_NAME}</span>
            <span className="text-xs text-gray-400 font-medium hidden lg:inline">ניהול מוסך</span>
          </a>
          <div className="flex-1 flex justify-center min-w-0">{!isPreview && <CaseSearch />}</div>
          {!isPreview && <NotificationsBell userId={user.id} role={actualRole} />}
          <UserMenu name={profile?.full_name ?? user.email ?? ''} roleLabel={roleLabel} branchName={branchName} email={user.email ?? ''} isCeo={actualRole === 'CEO'} />
        </div>

        <div className="hidden md:block px-6 border-t border-gray-100 bg-gray-50">
          <div className="py-2">
            <SidebarNav links={links} badges={{ '/messages': unreadMessages ?? 0 }} />
          </div>
        </div>
      </header>

      {/* Main content — room at the bottom for the phone's bottom bar. */}
      <main className="flex-1 p-3 pb-24 sm:p-6 sm:pb-24 md:pb-6 bg-surface min-h-screen overflow-x-hidden">{children}</main>
      <BottomNav role={role} links={links} badges={{ '/messages': unreadMessages ?? 0 }} />
      {/* 🎤 dictation in every text box (#15) */}
      {!isPreview && <DictationAssist />}
    </div>
  );
}
