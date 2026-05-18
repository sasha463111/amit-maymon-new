'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Save, Users as UsersIcon } from 'lucide-react';
import { updateSystemUser, startViewAsUser, type SystemUser } from '@/app/actions/users';
import type { UserRole } from '@/types/database';

const ROLE_LABELS: Record<UserRole, string> = {
  CEO: 'מנכ"ל',
  SERVICE_MANAGER: 'מנהל שירות',
  OFFICE: 'משרד',
  PAINTER: 'פחח',
  SERVICE_ADVISOR: 'יועצת שירות',
};

interface Branch {
  id: string;
  name: string;
}

export function UsersTab({
  initialUsers,
  branches,
  currentUserId,
}: {
  initialUsers: SystemUser[];
  branches: Branch[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ role: UserRole; branch_id: string | null; is_active: boolean; full_name: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function startEdit(u: SystemUser) {
    setEditingId(u.id);
    setDraft({ role: u.role, branch_id: u.branch_id, is_active: u.is_active, full_name: u.full_name });
    setError(null);
  }

  async function saveEdit(u: SystemUser) {
    if (!draft) return;
    setBusyId(u.id);
    setError(null);
    const res = await updateSystemUser(u.id, draft);
    setBusyId(null);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setUsers((prev) =>
      prev.map((x) =>
        x.id === u.id
          ? {
              ...x,
              role: draft.role,
              branch_id: draft.branch_id,
              branch_name: branches.find((b) => b.id === draft.branch_id)?.name ?? null,
              is_active: draft.is_active,
              full_name: draft.full_name,
            }
          : x
      )
    );
    setEditingId(null);
    setDraft(null);
  }

  async function viewAs(u: SystemUser) {
    if (u.id === currentUserId) return;
    setBusyId(u.id);
    const res = await startViewAsUser(u.id);
    setBusyId(null);
    if (res?.error) {
      setError(res.error);
      return;
    }
    startTransition(() => {
      router.push('/cases');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2 text-gray-700">
        <UsersIcon size={20} className="text-indigo-500" />
        <h2 className="text-lg font-bold">משתמשי המערכת</h2>
        <span className="text-sm text-gray-500">({users.length})</span>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
        ℹ️ כדי <strong>ליצור משתמש חדש</strong>, היכנס ל-Supabase Dashboard → Authentication → Add user. אחרי שתיצור,
        חזור לכאן והגדר את התפקיד והסניף. המערכת יוצרת אוטומטית רשומה ב-<code className="bg-white px-1 rounded">profiles</code> דרך טריגר.
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          ⚠️ {error}
        </div>
      )}

      <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-right px-3 py-2">שם</th>
              <th className="text-right px-3 py-2">תפקיד</th>
              <th className="text-right px-3 py-2">סניף</th>
              <th className="text-right px-3 py-2">פעיל</th>
              <th className="text-right px-3 py-2">יועץ פחח</th>
              <th className="text-right px-3 py-2">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => {
              const isEditing = editingId === u.id;
              return (
                <tr key={u.id} className="hover:bg-gray-50/50">
                  <td className="px-3 py-2">
                    {isEditing && draft ? (
                      <input
                        type="text"
                        value={draft.full_name}
                        onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-40"
                      />
                    ) : (
                      <span className="font-semibold text-gray-800">{u.full_name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing && draft ? (
                      <select
                        value={draft.role}
                        onChange={(e) => setDraft({ ...draft, role: e.target.value as UserRole })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      >
                        {Object.entries(ROLE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-700">{ROLE_LABELS[u.role] ?? u.role}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing && draft ? (
                      <select
                        value={draft.branch_id ?? ''}
                        onChange={(e) => setDraft({ ...draft, branch_id: e.target.value || null })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      >
                        <option value="">— ללא (CEO) —</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-600">{u.branch_name ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing && draft ? (
                      <input
                        type="checkbox"
                        checked={draft.is_active}
                        onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                    ) : (
                      <span className={u.is_active ? 'text-green-600' : 'text-red-600'}>
                        {u.is_active ? '✓' : '✗'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{u.is_bodywork_advisor ? '✓' : '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => void saveEdit(u)}
                            className="px-2 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            <Save size={12} />
                            שמור
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingId(null); setDraft(null); }}
                            className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                          >
                            ביטול
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(u)}
                            className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium hover:bg-indigo-200"
                          >
                            ערוך
                          </button>
                          {u.id !== currentUserId && (
                            <button
                              type="button"
                              disabled={busyId === u.id}
                              onClick={() => void viewAs(u)}
                              title="עבור לתצוגה של משתמש זה"
                              className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200 disabled:opacity-50 flex items-center gap-1"
                            >
                              <Eye size={12} />
                              צפה כמותו
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
