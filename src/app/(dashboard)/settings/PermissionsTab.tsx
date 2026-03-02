'use client';

import { useState } from 'react';
import { updateRolePermission } from '@/app/actions/settings';
import type { RolePermission } from '@/types/database';

const ACTION_LABELS: Record<string, string> = {
  create_case: 'פתיחת תיק',
  complete_professional_step: 'השלמת שלב מקצועי',
  complete_closure_step: 'השלמת שלב סגירה',
  manage_settings: 'ניהול הגדרות',
  decide_approvals: 'אישור בקשות',
  manage_extras_status: 'ניהול תוספות',
  upload_documents: 'העלאת מסמכים',
  delete_documents: 'מחיקת מסמכים',
};

const ROLE_LABELS: Record<string, string> = {
  CEO: 'מנכ"ל',
  SERVICE_MANAGER: 'מנהל שירות',
  OFFICE: 'משרד',
  PAINTER: 'פחח',
  SERVICE_ADVISOR: 'יועצת שירות',
};

interface PermissionsTabProps {
  initialPermissions: RolePermission[];
}

export function PermissionsTab({ initialPermissions }: PermissionsTabProps) {
  const [permissions, setPermissions] = useState<RolePermission[]>(initialPermissions);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const roles = Array.from(new Set(permissions.map((p) => p.role))).sort();
  const actions = Array.from(new Set(permissions.map((p) => p.action))).sort();

  function getPermission(role: string, action: string): boolean {
    return permissions.find((p) => p.role === role && p.action === action)?.enabled ?? false;
  }

  async function handleToggle(role: string, action: string, enabled: boolean) {
    if (role === 'CEO') return; // CEO permissions locked
    const key = `${role}-${action}`;
    setSaving(key);
    setMessage(null);

    // Optimistic update
    setPermissions((prev) =>
      prev.map((p) => (p.role === role && p.action === action ? { ...p, enabled } : p))
    );

    const res = await updateRolePermission(role, action, enabled);
    setSaving(null);
    if (res.error) {
      // Revert on error
      setPermissions((prev) =>
        prev.map((p) => (p.role === role && p.action === action ? { ...p, enabled: !enabled } : p))
      );
      setMessage({ text: res.error, ok: false });
    } else {
      setMessage({ text: 'ההרשאה עודכנה', ok: true });
      setTimeout(() => setMessage(null), 3000);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-bold mb-4">הרשאות לפי תפקיד</h2>

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            message.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {message.ok ? '✓' : '⚠️'} {message.text}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 rounded-lg overflow-hidden text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-right font-semibold text-gray-600 border-b border-gray-200">פעולה</th>
              {roles.map((role) => (
                <th key={role} className="px-4 py-3 text-center font-semibold text-gray-600 border-b border-gray-200">
                  {ROLE_LABELS[role] ?? role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {actions.map((action, i) => (
              <tr key={action} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-3 font-medium text-gray-700 border-b border-gray-100">
                  {ACTION_LABELS[action] ?? action}
                </td>
                {roles.map((role) => {
                  const enabled = getPermission(role, action);
                  const isCeo = role === 'CEO';
                  const key = `${role}-${action}`;
                  const isSaving = saving === key;

                  return (
                    <td key={role} className="px-4 py-3 text-center border-b border-gray-100">
                      <button
                        type="button"
                        disabled={isCeo || isSaving}
                        onClick={() => void handleToggle(role, action, !enabled)}
                        className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${
                          isCeo ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                        } ${enabled ? 'bg-green-500 justify-end' : 'bg-gray-300 justify-start'}`}
                        title={isCeo ? 'לא ניתן לשנות הרשאות מנכ"ל' : undefined}
                      >
                        <span className="w-5 h-5 bg-white rounded-full shadow transition-all" />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-500">* הרשאות מנכ&quot;ל נעולות ולא ניתנות לשינוי</p>
    </div>
  );
}
