import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getRolePermissions, getWorkflowStepTemplates, getBodyworkAdvisors } from '@/app/actions/settings';
import { listSystemUsers } from '@/app/actions/users';
import { PermissionsTab } from './PermissionsTab';
import { ChecklistTab } from './ChecklistTab';
import { BodyworkAdvisorsTab } from './BodyworkAdvisorsTab';
import { UsersTab } from './UsersTab';
import type { RolePermission, WorkflowStepTemplate } from '@/types/database';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const profile = profileData as { role: string } | null;
  if (profile?.role !== 'CEO') redirect('/cases');

  const resolvedParams = await searchParams;
  const { tab = 'permissions' } = resolvedParams;
  const activeTab =
    tab === 'checklist' ? 'checklist' :
    tab === 'advisors' ? 'advisors' :
    tab === 'users' ? 'users' :
    'permissions';

  const [permissionsResult, stepsResult, advisorsResult, usersResult, branchesResult] = await Promise.all([
    getRolePermissions(),
    getWorkflowStepTemplates(),
    getBodyworkAdvisors(),
    listSystemUsers(),
    supabase.from('branches').select('id, name').order('name'),
  ]);

  const permissions = (permissionsResult.data ?? []) as RolePermission[];
  const steps = (stepsResult.data ?? []) as WorkflowStepTemplate[];
  const advisors = advisorsResult.data ?? [];
  const systemUsers = usersResult.data ?? [];
  const branches = (branchesResult.data ?? []) as { id: string; name: string }[];

  return (
    <div dir="rtl">
      <div className="flex items-center gap-3 mb-4 sm:mb-6">
        <span className="text-3xl sm:text-4xl">⚙️</span>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-800">הגדרות מערכת</h1>
          <p className="text-gray-500 text-xs sm:text-sm mt-1 hidden sm:block">ניהול הרשאות, צ&apos;קליסט ויועצי פחחות</p>
        </div>
      </div>

      {(permissionsResult.error || stepsResult.error) && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          ⚠️ שגיאה בטעינת הנתונים: {permissionsResult.error ?? stepsResult.error}
        </div>
      )}

      {/* Tabs — horizontal scroll on mobile */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <a
          href="/settings?tab=permissions"
          className={`whitespace-nowrap px-4 sm:px-5 py-3 text-sm font-medium border-b-2 transition-colors shrink-0 ${
            activeTab === 'permissions'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          🔐 הרשאות
        </a>
        <a
          href="/settings?tab=checklist"
          className={`whitespace-nowrap px-4 sm:px-5 py-3 text-sm font-medium border-b-2 transition-colors shrink-0 ${
            activeTab === 'checklist'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          ✅ צ&apos;קליסט
        </a>
        <a
          href="/settings?tab=advisors"
          className={`whitespace-nowrap px-4 sm:px-5 py-3 text-sm font-medium border-b-2 transition-colors shrink-0 ${
            activeTab === 'advisors'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          🔧 יועצי פחחות
        </a>
        <a
          href="/settings?tab=users"
          className={`whitespace-nowrap px-4 sm:px-5 py-3 text-sm font-medium border-b-2 transition-colors shrink-0 ${
            activeTab === 'users'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          👥 משתמשים
        </a>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-3 sm:p-6">
        {activeTab === 'permissions' ? (
          <PermissionsTab initialPermissions={permissions} />
        ) : activeTab === 'checklist' ? (
          <ChecklistTab initialSteps={steps} />
        ) : activeTab === 'advisors' ? (
          <BodyworkAdvisorsTab initialAdvisors={advisors} />
        ) : (
          <UsersTab initialUsers={systemUsers} branches={branches} currentUserId={user.id} />
        )}
      </div>
    </div>
  );
}
