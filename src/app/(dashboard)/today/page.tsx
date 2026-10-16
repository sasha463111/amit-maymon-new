import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { loadToday, ROLE_TABS, type TodayRole } from '@/lib/today.server';
import { TodayClient } from './TodayClient';

export const dynamic = 'force-dynamic';

// "מה מחכה לי היום" — on real data (Amit 15/10). Since 15/10 (Tomer, notification
// overload) every role has its own, personal screen; the CEO also previews
// every role's screen (?as=).
const ROLE_VIEW: Record<string, TodayRole> = {
  CEO: 'ceo', SERVICE_ADVISOR: 'advisor', SERVICE_MANAGER: 'advisor', PAINTER: 'painter', OFFICE: 'office',
  WAREHOUSE: 'warehouse', WAREHOUSE_MANAGER: 'warehouse', COLLECTIONS: 'collections', ACCOUNTANT: 'collections', DRIVER: 'driver',
};
export default async function TodayPage(props: { searchParams?: Promise<{ as?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: prof } = await supabase.from('profiles').select('role, full_name, branch_ids, collections_manager').eq('id', user.id).maybeSingle();
  const p = prof as { role: string; full_name: string | null; branch_ids: string[] | null; collections_manager: boolean | null } | null;
  // Not '/': that lands on /today again (ROLE_HOME) — a loop.
  if (!p || !ROLE_VIEW[p.role]) redirect('/cases');
  const isCeo = p.role === 'CEO';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) redirect('/cases');
  const db = createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  // The CEO may preview any role (company-wide); everyone else sees only their own.
  const role = isCeo ? ((ROLE_TABS.find(([k]) => k === searchParams?.as)?.[0] ?? 'ceo') as TodayRole) : ROLE_VIEW[p.role];
  const supervisor = isCeo || p.role === 'ACCOUNTANT' || (p.role === 'COLLECTIONS' && !!p.collections_manager);
  const cards = await loadToday(db, role, { userId: user.id, branchIds: p.branch_ids ?? [], supervisor });
  return <TodayClient role={role} cards={cards} name={(p.full_name ?? '').split(' ')[0]} preview={isCeo} />;
}
