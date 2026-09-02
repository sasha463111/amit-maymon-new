'use client';

import { useEffect, useState } from 'react';
import { getAuditLogs, getActivityLogs, getUserCreationTimeline } from '@/app/actions/audit';

export function AuditTab() {
  const [tab, setTab] = useState<'users' | 'changes' | 'activity'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [changes, setChanges] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    if (tab === 'users') {
      getUserCreationTimeline().then(r => {
        setUsers(r.data || []);
        setLoading(false);
      });
    } else if (tab === 'changes') {
      getAuditLogs().then(r => {
        setChanges(r.data || []);
        setLoading(false);
      });
    } else if (tab === 'activity') {
      getActivityLogs().then(r => {
        setActivities(r.data || []);
        setLoading(false);
      });
    }
  }, [tab]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex gap-2 border-b pb-3">
        <button
          onClick={() => setTab('users')}
          className={`px-4 py-2 font-medium transition ${tab === 'users' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
        >
          👤 משתמשים ({users.length})
        </button>
        <button
          onClick={() => setTab('changes')}
          className={`px-4 py-2 font-medium transition ${tab === 'changes' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
        >
          📝 שינויים ({changes.length})
        </button>
        <button
          onClick={() => setTab('activity')}
          className={`px-4 py-2 font-medium transition ${tab === 'activity' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
        >
          📊 פעילות ({activities.length})
        </button>
      </div>

      {loading && <div className="p-4 bg-blue-50 text-blue-700 rounded">⏳ טוען...</div>}

      {!loading && tab === 'users' && (
        <div className="space-y-2">
          {users.length === 0 ? (
            <p className="text-gray-500">אין משתמשים</p>
          ) : (
            users.map((u: any) => (
              <div key={u.id} className="p-3 border rounded bg-gray-50">
                <p className="font-medium">{u.full_name}</p>
                <p className="text-xs text-gray-600">תפקיד: {u.role}</p>
                <p className="text-xs text-gray-400">נוצר: {u.created_at?.substring(0, 10)}</p>
              </div>
            ))
          )}
        </div>
      )}

      {!loading && tab === 'changes' && (
        <div className="space-y-2">
          {changes.length === 0 ? (
            <p className="text-gray-500">אין שינויים</p>
          ) : (
            changes.map((c: any) => (
              <div key={c.id} className="p-3 border rounded bg-amber-50">
                <p className="font-medium">{c.action} - {c.table_name}</p>
                <p className="text-xs text-gray-400">{c.created_at?.substring(0, 10)}</p>
              </div>
            ))
          )}
        </div>
      )}

      {!loading && tab === 'activity' && (
        <div className="space-y-2">
          {activities.length === 0 ? (
            <p className="text-gray-500">אין פעילות</p>
          ) : (
            activities.map((a: any) => (
              <div key={a.id} className="p-3 border rounded bg-green-50">
                <p className="font-medium text-sm">{a.action}</p>
                {a.page_url && <p className="text-xs text-gray-600">{a.page_url}</p>}
                <p className="text-xs text-gray-400">{a.created_at?.substring(0, 10)}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
