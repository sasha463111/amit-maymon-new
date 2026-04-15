'use client';

import { useState } from 'react';
import { toggleBodyworkAdvisor, type BodyworkAdvisor } from '@/app/actions/settings';

const ROLE_LABELS: Record<string, string> = {
  SERVICE_MANAGER: 'מנהל שירות',
  SERVICE_ADVISOR: 'יועץ שירות',
};

export function BodyworkAdvisorsTab({ initialAdvisors }: { initialAdvisors: BodyworkAdvisor[] }) {
  const [advisors, setAdvisors] = useState<BodyworkAdvisor[]>(initialAdvisors);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(advisor: BodyworkAdvisor, value: boolean) {
    setError(null);
    setSaving(advisor.id);
    // Optimistic
    setAdvisors((prev) =>
      prev.map((a) => (a.id === advisor.id ? { ...a, is_bodywork_advisor: value } : a))
    );

    const res = await toggleBodyworkAdvisor(advisor.id, value);
    if (res?.error) {
      setError(res.error);
      // Revert
      setAdvisors((prev) =>
        prev.map((a) => (a.id === advisor.id ? { ...a, is_bodywork_advisor: !value } : a))
      );
    }
    setSaving(null);
  }

  const activeAdvisors = advisors.filter((a) => a.is_bodywork_advisor);

  return (
    <div dir="rtl">
      <div className="mb-4">
        <p className="text-sm text-gray-500">
          יועצי פחחות מקבלים התראות כאשר פחח מגיש בקשה, וכאשר רכב נשלח לשטיפה.
          הם גם יופיעו ברשימת הבחירה בבקרת איכות.
        </p>
        {activeAdvisors.length > 0 && (
          <p className="text-sm text-green-700 mt-2 font-medium">
            {activeAdvisors.length} יועץ/ת פעיל/ה: {activeAdvisors.map((a) => a.full_name).join(', ')}
          </p>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          ⚠️ {error}
        </div>
      )}

      {advisors.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">
          אין משתמשים מתאימים (נדרש תפקיד מנהל שירות או יועץ שירות)
        </p>
      ) : (
        <div className="space-y-2">
          {advisors.map((advisor) => (
            <div
              key={advisor.id}
              className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                advisor.is_bodywork_advisor
                  ? 'bg-green-50 border-green-200'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                    advisor.is_bodywork_advisor
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-300 text-gray-600'
                  }`}
                >
                  {advisor.full_name?.[0] ?? '?'}
                </div>
                <div>
                  <p className="font-medium text-gray-800">{advisor.full_name}</p>
                  <p className="text-xs text-gray-500">{ROLE_LABELS[advisor.role] ?? advisor.role}</p>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-gray-500">
                  {advisor.is_bodywork_advisor ? 'יועץ פעיל' : 'לא פעיל'}
                </span>
                <input
                  type="checkbox"
                  checked={advisor.is_bodywork_advisor}
                  disabled={saving === advisor.id}
                  onChange={(e) => void handleToggle(advisor, e.target.checked)}
                  className="w-5 h-5 accent-green-600 cursor-pointer"
                />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
