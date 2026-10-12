import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { listPartReturns } from '@/app/actions/partReturns';
import { ReturnsClient } from './ReturnsClient';
import { canUsePartReturns } from '@/lib/partReturns';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['CEO', 'SERVICE_ADVISOR', 'SERVICE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_MANAGER', 'PAINTER']);

// "החזרות" — parts returns & credits (Amit, 2026-10-12).
export default async function ReturnsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: prof } = await supabase.from('profiles').select('role, branch_ids').eq('id', user.id).maybeSingle();
  const profile = prof as { role: string; branch_ids: string[] | null } | null;
  if (!profile || !ALLOWED.has(profile.role) || !canUsePartReturns(profile.role)) redirect('/');

  const [{ rows, error }, { data: branchRows }] = await Promise.all([
    listPartReturns(),
    supabase.from('branches').select('id, name').order('name'),
  ]);
  const allBranches = (branchRows ?? []) as { id: string; name: string }[];
  const myBranchIds = profile.branch_ids ?? [];
  const branches = myBranchIds.length ? allBranches.filter((b) => myBranchIds.includes(b.id)) : allBranches;

  return <ReturnsClient rows={rows} role={profile.role} branches={branches} error={error} />;
}
