import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getReceivables } from '@/app/actions/receivables';
import { ReceivablesClient } from './ReceivablesClient';

export const dynamic = 'force-dynamic';

// "דשבורד גבייה" — CEO + people he approves (finance_viewers), Amit 2026-10-14.
export default async function ReceivablesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const data = await getReceivables();
  if (data.error === 'אין הרשאה') redirect('/');
  return <ReceivablesClient data={data} />;
}
