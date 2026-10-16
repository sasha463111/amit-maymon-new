import { getSessionUser, getMyProfile } from '@/lib/currentUser.server';
import { redirect } from 'next/navigation';
import { listPartReturns } from '@/app/actions/partReturns';
import { ReturnsClient } from './ReturnsClient';
import { canUsePartReturns } from '@/lib/partReturns';
import { listSupplierDocs } from '@/app/actions/supplierDocs';

export const dynamic = 'force-dynamic';
// Claude calls run inside this page's server actions (photo reading / the
// advisor) and can take more than the default ~10 s — give them a minute.
export const maxDuration = 60;

// Invoices / delivery notes archive tab — everyone in the module except painters.
// Painters photograph documents too and see only their own (RLS supplier_documents_own_select).
const DOC_ROLES = new Set(['CEO', 'SERVICE_ADVISOR', 'SERVICE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_MANAGER', 'ACCOUNTANT', 'PAINTER']);
const ALLOWED = new Set(['CEO', 'SERVICE_ADVISOR', 'SERVICE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_MANAGER', 'PAINTER', 'ACCOUNTANT']);

// "החזרות" — parts returns & credits (Amit, 2026-10-12).
export default async function ReturnsPage() {
  // Cached per request — listPartReturns / listSupplierDocs below reuse it.
  const { supabase, user } = await getSessionUser();
  if (!user) redirect('/login');

  const profile = await getMyProfile();
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
