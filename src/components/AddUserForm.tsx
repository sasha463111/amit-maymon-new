'use client';

import { useState } from 'react';
import { Plus, Mail, Lock, User, Shield, MapPin } from 'lucide-react';
import { createNewSystemUser, type SystemUser } from '@/app/actions/users';
import type { UserRole } from '@/types/database';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'SERVICE_MANAGER', label: 'מנהל שירות' },
  { value: 'OFFICE', label: 'משרד' },
  { value: 'PAINTER', label: 'פחח' },
  { value: 'SERVICE_ADVISOR', label: 'יועצת שירות' },
];

interface Branch {
  id: string;
  name: string;
}

interface Props {
  branches: Branch[];
  onUserCreated?: (user: any) => void;
}

export function AddUserForm({ branches, onUserCreated }: Props) {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'OFFICE' as UserRole,
    branch_ids: [] as string[],
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const res = await createNewSystemUser(formData);
    setLoading(false);

    if (res?.ok) {
      setResult({ ok: true, msg: `✅ משתמש ${formData.email} נוצר בהצלחה` });
      setFormData({
        email: '',
        password: '',
        full_name: '',
        role: 'OFFICE',
        branch_ids: [],
      });
      onUserCreated?.({ id: res.userId, email: res.email });
      setTimeout(() => setShowForm(false), 2000);
    } else {
      setResult({ ok: false, msg: `❌ ${res?.error ?? 'נכשל'}` });
    }
  }

  const toggleBranch = (branchId: string) => {
    setFormData((prev) => ({
      ...prev,
      branch_ids: prev.branch_ids.includes(branchId)
        ? prev.branch_ids.filter((id) => id !== branchId)
        : [...prev.branch_ids, branchId],
    }));
  };

  const selectedRole = ROLE_OPTIONS.find((r) => r.value === formData.role);
  const isCeo = formData.role === 'CEO';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 px-4 py-2.5 rounded-lg transition-colors font-medium"
        >
          <Plus size={18} />
          משתמש חדש
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">יצירת משתמש חדש</h3>
            <button
              onClick={() => setShowForm(false)}
              className="text-gray-400 hover:text-gray-600 text-lg"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">דוא"ל</label>
              <div className="relative">
                <Mail size={16} className="absolute right-3 top-2.5 text-gray-400" />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="user@example.com"
                  className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סיסמה (לפחות 8 תווים)</label>
              <div className="relative">
                <Lock size={16} className="absolute right-3 top-2.5 text-gray-400" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא</label>
              <div className="relative">
                <User size={16} className="absolute right-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="שם התיקיה"
                  className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תפקיד</label>
              <div className="relative">
                <Shield size={16} className="absolute right-3 top-2.5 text-gray-400" />
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole, branch_ids: [] })}
                  className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm appearance-none bg-white"
                  disabled={loading}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Branches (only if not CEO) */}
            {!isCeo && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">סניפים</label>
                <div className="space-y-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
                  {branches.length === 0 ? (
                    <p className="text-sm text-gray-500">אין סניפים זמינים</p>
                  ) : (
                    branches.map((branch) => (
                      <label key={branch.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.branch_ids.includes(branch.id)}
                          onChange={() => toggleBranch(branch.id)}
                          disabled={loading}
                          className="w-4 h-4 border-gray-300 rounded"
                        />
                        <span className="text-sm text-gray-700">{branch.name}</span>
                      </label>
                    ))
                  )}
                </div>
                {formData.branch_ids.length === 0 && !isCeo && (
                  <p className="text-xs text-red-500 mt-1">חובה לבחור סניף אחד לפחות</p>
                )}
              </div>
            )}

            {/* Result message */}
            {result && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  result.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {result.msg}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={loading || (formData.branch_ids.length === 0 && !isCeo)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm"
              >
                {loading ? '⏳ יוצר...' : '✓ יצור משתמש'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors text-sm"
              >
                ביטול
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
