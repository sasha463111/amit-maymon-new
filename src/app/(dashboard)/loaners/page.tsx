import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { listLoaners } from '@/app/actions/loaners';
import { canUseLoaners } from '@/lib/loaners';
import { LoanersClient } from './LoanersClient';

export const dynamic = 'force-dynamic';

// "מעקב רכב חליפי" — office (אילנה, אילנית, אביה) + CEO (Amit, 2026-10-14).
export default async function LoanersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: prof } = await supabase.from('profiles').select('role, loaners_access').eq('id', user.id).maybeSingle();
  if (!canUseLoaners((prof as { role: string } | null)?.role, !!(prof as { loaners_access?: boolean } | null)?.loaners_access)) redirect('/');
  const { fleet, handovers, branches, error } = await listLoaners();
  return <LoanersClient fleet={fleet} handovers={handovers} branches={branches} error={error ?? null} />;
}
