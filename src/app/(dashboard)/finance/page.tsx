import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { FinanceClient, type FinanceRow } from './FinanceClient';

export const dynamic = 'force-dynamic';

// "כספים" — finance dashboard over closed-job invoices (Amit, 2026-10-14).
// CEO only — also enforced by RLS on finance_closures.
export default async function FinancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role: string } | null)?.role;
  // CEO + the bookkeeper (read-only; RLS finance_closures_accountant_read).
  if (role !== 'CEO' && role !== 'ACCOUNTANT') redirect('/');

  const [{ data, error }, { data: branchRows }] = await Promise.all([
    supabase
      .from('finance_closures')
      .select('id, closed_on, branch_id, plate, work_source, insurer, claim_type, appraiser, amount_ours, amount_shir, review_note')
      .order('closed_on', { ascending: false })
      .limit(20000),
    supabase.from('branches').select('id, name').order('name'),
  ]);

  const branches = (branchRows ?? []) as { id: string; name: string }[];
  const rows = ((data ?? []) as FinanceRow[]).map((r) => ({
    ...r,
    amount_ours: Number(r.amount_ours),
    amount_shir: r.amount_shir == null ? null : Number(r.amount_shir),
  }));

  return <FinanceClient rows={rows} branches={branches} error={error?.message ?? null} />;
}
