import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { listPartReturns } from '@/app/actions/partReturns';
import { ReturnsClient } from './ReturnsClient';
import { canUsePartReturns } from '@/lib/partReturns';
import { listSupplierDocs } from '@/app/actions/supplierDocs';

export const dynamic = 'force-dynamic';

// Invoices / delivery notes archive tab — everyone in the module except painters.
// Painters photograph documents too and see only their own (RLS supplier_documents_own_select).
const DOC_ROLES = new Set(['CEO', 'SERVICE_ADVISOR', 'SERVICE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_MANAGER', 'ACCOUNTANT', 'PAINTER']);
const ALLOWED = new Set(['CEO', 'SERVICE_ADVISOR', 'SERVICE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_MANAGER', 'PAINTER', 'ACCOUNTANT']);

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

  const docsAllowed = DOC_ROLES.has(profile.role);
  const [{ rows, error }, { data: branchRows }, docs] = await Promise.all([
    listPartReturns(),
    supabase.from('branches').select('id, name').order('name'),
    docsAllowed ? listSupplierDocs() : Promise.resolve(null),
  ]);
  const allBranches = (branchRows ?? []) as { id: string; name: string }[];
  const myBranchIds = profile.branch_ids ?? [];
  const branches = myBranchIds.length ? allBranches.filter((b) => myBranchIds.includes(b.id)) : allBranches;

  return <ReturnsClient rows={rows} role={profile.role} branches={branches} error={error ?? docs?.error} docs={docs ? docs.rows : null} />;
}
