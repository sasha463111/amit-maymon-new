import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { loadDashboards } from '@/lib/dashboards.server';
import { DashboardsClient } from './DashboardsClient';

export const dynamic = 'force-dynamic';

// "📊 דשבורדים" — a summary per module (Tomer, 15/10). CEO only (Tomer, Amit).
export default async function DashboardsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if ((prof as { role: string } | null)?.role !== 'CEO') redirect('/');
  const data = await loadDashboards();
  if (!data) return <p className="p-6 text-red-600">שרת לא מוגדר</p>;
  return <DashboardsClient data={data} />;
}
