import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NotificationsList } from './NotificationsList';

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: notificationsData } = await supabase
    .from('notifications')
    .select('id, type, title, body, read, created_at, case_id, action_url, triggered_by')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (notificationsData ?? []) as {
    id: string;
    type: string | null;
    title: string;
    body: string | null;
    read: boolean;
    created_at: string;
    case_id: string | null;
    action_url: string | null;
    triggered_by: string | null;
  }[];

  // Collect case_ids and triggered_by user ids
  const seenCaseIds = new Set<string>();
  const caseIds: string[] = [];
  const userIds = new Set<string>();
  for (const n of rows) {
    if (n.case_id && !seenCaseIds.has(n.case_id)) {
      seenCaseIds.add(n.case_id);
      caseIds.push(n.case_id);
    }
    if (n.triggered_by) userIds.add(n.triggered_by);
  }
  const plateMap = new Map<string, string>();
  const userNameMap = new Map<string, string>();

  await Promise.all([
    (async () => {
      if (caseIds.length === 0) return;
      const { data: caseRows } = await supabase
        .from('cases')
        .select('id, cars(license_plate)')
        .in('id', caseIds);
      for (const c of (caseRows ?? []) as { id: string; cars: { license_plate: string | null } | { license_plate: string | null }[] | null }[]) {
        const car = Array.isArray(c.cars) ? c.cars[0] : c.cars;
        if (car?.license_plate) plateMap.set(c.id, car.license_plate);
      }
    })(),
    (async () => {
      if (userIds.size === 0) return;
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', Array.from(userIds));
      for (const p of (profilesData ?? []) as { id: string; full_name: string | null }[]) {
        if (p.full_name) userNameMap.set(p.id, p.full_name);
      }
    })(),
  ]);

  const notificationsWithPlate = rows.map((n) => ({
    ...n,
    license_plate: n.case_id ? (plateMap.get(n.case_id) ?? null) : null,
    triggered_by_name: n.triggered_by ? (userNameMap.get(n.triggered_by) ?? null) : null,
  }));

  const unreadCount = rows.filter((n) => !n.read).length;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">התראות</h1>
          {unreadCount > 0 ? (
            <p className="text-sm text-indigo-600 font-medium mt-1">
              {unreadCount} התראות לא נקראו
            </p>
          ) : (
            <p className="text-sm text-gray-400 mt-1">הכל עדכני</p>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-sm font-medium">
            {rows.length} סה&quot;כ
          </span>
          {unreadCount > 0 && (
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold">
              {unreadCount} חדשות
            </span>
          )}
        </div>
      </div>
      <NotificationsList notifications={notificationsWithPlate} unreadCount={unreadCount} />
    </div>
  );
}
