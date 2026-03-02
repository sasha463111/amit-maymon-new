import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getRolePermissions, getWorkflowStepTemplates } from '@/app/actions/settings';
import { PermissionsTab } from './PermissionsTab';
import { ChecklistTab } from './ChecklistTab';
import type { RolePermission, WorkflowStepTemplate } from '@/types/database';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
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

  const [permissionsResult, stepsResult] = await Promise.all([
    getRolePermissions(),
    getWorkflowStepTemplates(),
  ]);

  const permissions = (permissionsResult.data ?? []) as RolePermission[];
  const steps = (stepsResult.data ?? []) as WorkflowStepTemplate[];

  const { tab = 'permissions' } = searchParams;
  const activeTab = tab === 'checklist' ? 'checklist' : 'permissions';

  return (
    <div dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl">⚙️</span>
        <div>
          <h1 className="text-3xl font-bold text-gray-800">הגדרות מערכת</h1>
          <p className="text-gray-500 text-sm mt-1">ניהול הרשאות וצ&apos;קליסט</p>
        </div>
      </div>

      {(permissionsResult.error || stepsResult.error) && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          ⚠️ שגיאה בטעינת הנתונים: {permissionsResult.error ?? stepsResult.error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <a
          href="/settings?tab=permissions"
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'permissions'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          🔐 הרשאות
        </a>
        <a
          href="/settings?tab=checklist"
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'checklist'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          ✅ צ&apos;קליסט
        </a>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        {activeTab === 'permissions' ? (
          <PermissionsTab initialPermissions={permissions} />
        ) : (
          <ChecklistTab initialSteps={steps} />
        )}
      </div>
    </div>
  );
}
