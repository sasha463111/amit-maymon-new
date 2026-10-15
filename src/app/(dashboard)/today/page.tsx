import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { loadToday, ROLE_TABS, type TodayRole } from '@/lib/today.server';
import { TodayClient } from './TodayClient';

export const dynamic = 'force-dynamic';

// "מה מחכה לי היום" — beta on real data (Amit, 2026-10-15). CEO only for now
// (new features start with the CEO); the role tabs show what each role's home
// screen would look like with today's real numbers.
export default async function TodayPage({ searchParams }: { searchParams?: { as?: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: prof } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();
  const p = prof as { role: string; full_name: string | null } | null;
  if (p?.role !== 'CEO') redirect('/');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) redirect('/');
  const db = createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const role = (ROLE_TABS.find(([k]) => k === searchParams?.as)?.[0] ?? 'ceo') as TodayRole;
  const cards = await loadToday(db, role);
  return <TodayClient role={role} cards={cards} name={(p.full_name ?? '').split(' ')[0]} />;
}
