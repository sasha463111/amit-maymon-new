'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Save, Users as UsersIcon, BellRing } from 'lucide-react';
import { updateSystemUser, startViewAsUser, resetUserPassword, setStaffPhone, setSmsRequired, forgetTrustedDevices, type SystemUser } from '@/app/actions/users';
import { PasswordReveal } from '@/components/PasswordReveal';
import { sendTestPushToSelf } from '@/app/actions/push';
import { AddUserForm } from '@/components/AddUserForm';
import type { UserRole } from '@/types/database';
import { formatDateTime } from '@/lib/dates';
import { STAFF_JOBS, jobByKey, jobFor, jobLabel } from '@/lib/staffJobs';

interface Branch {
  id: string;
  name: string;
}

export function UsersTab({
  initialUsers,
  branches,
  currentUserId,
  smsReady = false,
}: {
  initialUsers: SystemUser[];
  branches: Branch[];
  currentUserId: string;
  smsReady?: boolean;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ role: UserRole; office_function: 'REFERRALS' | 'CLOSURE' | null; branch_ids: string[]; is_active: boolean; full_name: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [pushTest, setPushTest] = useState<{ msg: string; ok: boolean } | null>(null);
  const [pushTestBusy, setPushTestBusy] = useState(false);
  // Personal passwords (Amit, 15/10): only the CEO resets; shown once.
  const [revealed, setRevealed] = useState<{ name: string; email: string; password: string; phone?: string | null } | null>(null);
  const [phoneEdit, setPhoneEdit] = useState<{ id: string; value: string } | null>(null);

  async function resetPassword(u: SystemUser) {
    if (!window.confirm(`לאפס את הסיסמה של ${u.full_name}? הסיסמה הקודמת תפסיק לעבוד מיד.`)) return;
    setBusyId(u.id);
    setError(null);
    const r = await resetUserPassword(u.id);
    setBusyId(null);
    if (r.error || !r.password) return setError(r.error ?? 'האיפוס נכשל');
    setRevealed({ name: r.name || u.full_name, email: r.email ?? '', password: r.password, phone: u.phone });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Login code by SMS (15/10): per person, or everyone who has a mobile number.
  async function toggleSms(u: SystemUser | 'ALL', required: boolean) {
    if (u === 'ALL' && !window.confirm('להפעיל קוד SMS בכניסה לכל העובדים שיש להם נייד במערכת? בכניסה הבאה כל אחד יקבל SMS עם קוד.')) return;
    setBusyId(u === 'ALL' ? 'ALL' : u.id);
    setError(null);
    const r = await setSmsRequired(u === 'ALL' ? 'ALL' : u.id, required);
    setBusyId(null);
    if (r.error) return setError(r.error);
    setUsers((list) => list.map((x) => (u === 'ALL' ? (x.is_active && x.phone ? { ...x, sms_required: required } : x) : x.id === u.id ? { ...x, sms_required: required } : x)));
    if (u === 'ALL' && r.withoutPhone?.length) setError(`הופעל ל-${r.count}. בלי נייד (לא הופעל): ${r.withoutPhone.join(', ')}`);
  }

  async function forgetDevices(u: SystemUser) {
    if (!window.confirm(`לשכוח את הטלפונים שזכרנו של ${u.full_name}? בכניסה הבאה יתבקש/תתבקש קוד SMS.`)) return;
    setBusyId(u.id);
    const r = await forgetTrustedDevices(u.id);
    setBusyId(null);
    if (r.error) setError(r.error);
  }

  const smsLine = (u: SystemUser) => (
    <span className="inline-flex items-center gap-1.5 flex-wrap text-[11px]">
      <span className={u.sms_required ? 'text-green-700' : 'text-gray-400'}>🔐 קוד SMS: {u.sms_required ? 'פעיל' : 'לא פעיל'}</span>
      <button type="button" disabled={busyId === u.id} onClick={() => void toggleSms(u, !u.sms_required)} className="underline text-indigo-700 disabled:opacity-50">
        {u.sms_required ? 'ביטול' : 'הפעלה'}
      </button>
      {u.sms_required && (
        <button type="button" disabled={busyId === u.id} onClick={() => void forgetDevices(u)} className="underline text-red-700 disabled:opacity-50">
          שכחת טלפונים
        </button>
      )}
    </span>
  );

  async function savePhone(u: SystemUser) {
    if (!phoneEdit) return;
    setBusyId(u.id);
    setError(null);
    const r = await setStaffPhone(u.id, phoneEdit.value);
    setBusyId(null);
    if (r.error) return setError(r.error);
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, phone: r.phone ?? null } : x)));
    setPhoneEdit(null);
  }

  // Mobile number (Amit, 15/10): call / WhatsApp, edit inline.
  const phoneLine = (u: SystemUser) =>
    phoneEdit?.id === u.id ? (
      <span className="inline-flex items-center gap-1.5 text-[11px]">
        <input
          value={phoneEdit.value}
          onChange={(e) => setPhoneEdit({ id: u.id, value: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && void savePhone(u)}
          inputMode="tel"
          dir="ltr"
          placeholder="050-1234567"
          autoFocus
          className="w-32 border border-gray-300 rounded px-2 py-0.5 text-xs"
        />
        <button type="button" disabled={busyId === u.id} onClick={() => void savePhone(u)} className="text-green-700 font-semibold">שמירה</button>
        <button type="button" onClick={() => setPhoneEdit(null)} className="text-gray-500">ביטול</button>
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 flex-wrap text-[11px]">
        <span className={u.phone ? 'text-gray-700' : 'text-gray-400'}>📱 {u.phone ?? 'אין נייד'}</span>
        {u.phone && (
          <>
            <a href={`tel:${u.phone.replace(/\D/g, '')}`} className="underline text-indigo-700">חיוג</a>
            <a href={`https://wa.me/972${u.phone.replace(/\D/g, '').slice(1)}`} target="_blank" rel="noreferrer" className="underline text-green-700">וואטסאפ</a>
          </>
        )}
        <button type="button" onClick={() => setPhoneEdit({ id: u.id, value: u.phone ?? '' })} className="underline text-indigo-700">{u.phone ? 'עריכה' : 'הוספה'}</button>
      </span>
    );


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
    setDraft({ role: u.role, office_function: u.office_function, branch_ids: u.branch_ids, is_active: u.is_active, full_name: u.full_name });
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
              office_function: draft.role === 'OFFICE' ? draft.office_function : null,
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

      <div className="flex items-center gap-2 flex-wrap rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm">
        <span>🔐 קוד SMS בכניסה: {users.filter((x) => x.is_active && x.sms_required).length} פעילים · {users.filter((x) => x.is_active && x.phone).length} עם נייד · {users.filter((x) => x.is_active).length} עובדים</span>
        {smsReady ? (
          <button type="button" disabled={busyId === 'ALL'} onClick={() => void toggleSms('ALL', true)} className="h-8 px-3 rounded-lg bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50">
            להפעיל לכולם (עם נייד)
          </button>
        ) : (
          <span className="text-xs text-amber-800">⏳ ספק ה-SMS עוד לא מחובר — הקוד לא יידרש מאף אחד עד החיבור</span>
        )}
      </div>
      {revealed && <PasswordReveal name={revealed.name} email={revealed.email} password={revealed.password} phone={revealed.phone} onClose={() => setRevealed(null)} />}
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
                        value={jobFor(draft.role, draft.office_function)?.key ?? ''}
                        onChange={(e) => {
                          const j = jobByKey(e.target.value);
                          if (j) setDraft({ ...draft, role: j.role, office_function: j.officeFunction });
                        }}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                      >
                        {STAFF_JOBS.map((j) => (
                          <option key={j.key} value={j.key}>
                            {j.label}
                          </option>
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
                      <UserMeta u={u} />
                      {phoneLine(u)}
                      {smsLine(u)}
                      <p className="text-xs text-gray-500 mt-0.5">
                        {jobLabel(u.role, u.office_function)}
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
                    <button
                      type="button"
                      disabled={busyId === u.id}
                      onClick={() => void resetPassword(u)}
                      className="flex-1 px-3 py-1.5 bg-amber-100 text-amber-800 rounded text-xs font-medium hover:bg-amber-200 disabled:opacity-50"
                    >
                      🔑 איפוס סיסמה
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
                      <>
                        <span className="font-semibold text-gray-800">{u.full_name}</span>
                        <UserMeta u={u} />
                      {phoneLine(u)}
                      {smsLine(u)}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing && draft ? (
                      <select
                        value={jobFor(draft.role, draft.office_function)?.key ?? ''}
                        onChange={(e) => {
                          const j = jobByKey(e.target.value);
                          if (j) setDraft({ ...draft, role: j.role, office_function: j.officeFunction });
                        }}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      >
                        {STAFF_JOBS.map((j) => (
                          <option key={j.key} value={j.key}>
                            {j.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-700">{jobLabel(u.role, u.office_function)}</span>
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
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => void resetPassword(u)}
                            className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs font-medium hover:bg-amber-200 disabled:opacity-50"
                          >
                            🔑 איפוס סיסמה
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

/** Login email + last sign-in + push status under a user's name. */
function UserMeta({ u }: { u: SystemUser }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-0.5 space-y-0.5">
      {u.email && (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(u.email ?? '').then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="text-xs text-indigo-700 hover:underline"
          dir="ltr"
          title="העתק כתובת"
        >
          {u.email} {copied ? '✓' : '⧉'}
        </button>
      )}
      <p className="text-[11px] text-gray-500">
        {u.last_sign_in_at ? `כניסה אחרונה ${formatDateTime(u.last_sign_in_at)}` : 'עוד לא נכנס/ה'}
        {' · '}
        <span className={u.has_push ? 'text-green-600' : 'text-amber-600'}>{u.has_push ? '🔔 התראות פעילות' : '🔕 התראות לא הופעלו'}</span>
        {!u.is_staff && <span className="text-gray-400"> · חשבון בדיקה</span>}
      </p>
    </div>
  );
}
