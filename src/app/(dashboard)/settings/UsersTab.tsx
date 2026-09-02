'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Save, Users as UsersIcon, BellRing } from 'lucide-react';
import { updateSystemUser, startViewAsUser, type SystemUser } from '@/app/actions/users';
import { sendTestPushToSelf } from '@/app/actions/push';
import { sendSummaryReport } from '@/app/actions/reports';
import { AddUserForm } from '@/components/AddUserForm';
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
  const [draft, setDraft] = useState<{ role: UserRole; branch_ids: string[]; is_active: boolean; full_name: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [pushTest, setPushTest] = useState<{ msg: string; ok: boolean } | null>(null);
  const [pushTestBusy, setPushTestBusy] = useState(false);
  const [reportResult, setReportResult] = useState<{ msg: string; ok: boolean } | null>(null);
  const [reportBusy, setReportBusy] = useState(false);

  async function handleSendReport() {
    setReportBusy(true);
    setReportResult(null);
    const res = await sendSummaryReport();
    if (res?.ok) {
      setReportResult({ ok: true, msg: '✅ הדוח נשלח.' });
    } else {
      setReportResult({ ok: false, msg: `❌ ${res?.error ?? 'נכשל'}` });
    }
    setReportBusy(false);
  }

  async function handleTestPush() {
    setPushTestBusy(true);
    setPushTest(null);
    const res = await sendTestPushToSelf();
    if (res?.ok) {
      setPushTest({ ok: true, msg: `✅ נשלח בהצלחה (${res.diagnostic ?? ''}). אם לא הגיע לטלפון — בדוק הרשאות התראות בדפדפן.` });
    } else {
      setPushTest({ ok: false, msg: `❌ ${res?.error ?? 'נכשל'} ${res?.diagnostic ? `(${res.diagnostic})` : ''}` });
    }
    setPushTestBusy(false);
  }

  function startEdit(u: SystemUser) {
    setEditingId(u.id);
    setDraft({ role: u.role, branch_ids: u.branch_ids, is_active: u.is_active, full_name: u.full_name });
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
              branch_ids: draft.branch_ids,
              branch_names: draft.branch_ids.map((bid) => branches.find((b) => b.id === bid)?.name ?? bid),
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

      {/* Create new user form — CEO only */}
      <AddUserForm
        branches={branches}
        onUserCreated={() => {
          // Refresh the page to show the new user in the list
          router.refresh();
        }}
      />

      {/* Push test card — diagnose if Web Push actually reaches your device */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
        <div className="flex items-start gap-3">
          <BellRing size={18} className="text-indigo-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-indigo-900 mb-1">בדיקת Push</p>
            <p className="text-xs text-indigo-700 mb-3">
              לחץ כדי לשלוח לעצמך התראת Push לבדיקה. ודא שלחצת קודם &quot;הפעל התראות&quot; בפעמון.
            </p>
            <button
              type="button"
              onClick={() => void handleTestPush()}
              disabled={pushTestBusy}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold disabled:opacity-50"
            >
              {pushTestBusy ? '⏳ שולח...' : 'שלח Push לעצמי'}
            </button>
            {pushTest && (
              <p className={`mt-2 text-xs rounded px-2 py-1 ${pushTest.ok ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>
                {pushTest.msg}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Summary report — same "trigger + show result" pattern as the push test above */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
        <div className="flex items-start gap-3">
          <UsersIcon size={18} className="text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-900 mb-1">דוח סיכום יומי</p>
            <p className="text-xs text-emerald-700 mb-3">
              שולח דוח למייל עם כמות תיקים פתוחים, ממתינים לסגירה והפניות — לפי סניף.
            </p>
            <button
              type="button"
              onClick={() => void handleSendReport()}
              disabled={reportBusy}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold disabled:opacity-50"
            >
              {reportBusy ? '⏳ שולח...' : 'שלח דוח עכשיו'}
            </button>
            {reportResult && (
              <p className={`mt-2 text-xs rounded px-2 py-1 ${reportResult.ok ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>
                {reportResult.msg}
              </p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          ⚠️ {error}
        </div>
      )}

      {/* MOBILE: cards */}
      <div className="md:hidden space-y-3">
        {users.map((u) => {
          const isEditing = editingId === u.id;
          return (
            <div key={u.id} className="bg-white border border-gray-200 rounded-lg p-3">
              {isEditing && draft ? (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] uppercase text-gray-400">שם</label>
                    <input
                      type="text"
                      value={draft.full_name}
                      onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase text-gray-400">תפקיד</label>
                      <select
                        value={draft.role}
                        onChange={(e) => setDraft({ ...draft, role: e.target.value as UserRole })}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                      >
                        {Object.entries(ROLE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-gray-400 block mb-2">סניפים</label>
                      <div className="flex flex-col gap-1.5">
                        {branches.map((b) => (
                          <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={draft.branch_ids.includes(b.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setDraft({ ...draft, branch_ids: [...draft.branch_ids, b.id] });
                                } else {
                                  setDraft({ ...draft, branch_ids: draft.branch_ids.filter((id) => id !== b.id) });
                                }
                              }}
                              className="w-4 h-4"
                            />
                            {b.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.is_active}
                      onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                      className="w-4 h-4"
                    />
                    משתמש פעיל
                  </label>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busyId === u.id}
                      onClick={() => void saveEdit(u)}
                      className="flex-1 px-3 py-2 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      <Save size={12} />
                      שמור
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingId(null); setDraft(null); }}
                      className="px-3 py-2 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{u.full_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {ROLE_LABELS[u.role] ?? u.role}
                        {u.branch_names.length > 0 && ` · ${u.branch_names.join(', ')}`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 text-[10px] shrink-0">
                      <span className={u.is_active ? 'text-green-600' : 'text-red-600'}>
                        {u.is_active ? '● פעיל' : '○ לא פעיל'}
                      </span>
                      {u.is_bodywork_advisor && <span className="text-amber-600">יועץ פחח</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(u)}
                      className="flex-1 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium hover:bg-indigo-200"
                    >
                      ערוך
                    </button>
                    {u.id !== currentUserId && (
                      <button
                        type="button"
                        disabled={busyId === u.id}
                        onClick={() => void viewAs(u)}
                        className="flex-1 px-3 py-1.5 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200 disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        <Eye size={12} />
                        צפה כמותו
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* DESKTOP: table */}
      <div className="hidden md:block overflow-x-auto bg-white rounded-lg border border-gray-200">
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
                      <div className="flex flex-col gap-1">
                        {branches.map((b) => (
                          <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={draft.branch_ids.includes(b.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setDraft({ ...draft, branch_ids: [...draft.branch_ids, b.id] });
                                } else {
                                  setDraft({ ...draft, branch_ids: draft.branch_ids.filter((id) => id !== b.id) });
                                }
                              }}
                              className="w-3 h-3"
                            />
                            {b.name}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-600">{u.branch_names.length > 0 ? u.branch_names.join(', ') : '—'}</span>
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
