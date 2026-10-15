import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { listAppRequests } from '@/app/actions/appRequests';
import { TicketsBoard } from '../requests/TicketsBoard';

export const dynamic = 'force-dynamic';

// "🚀 פיתוחים" — every feature / improvement request (Tomer, 15/10). CEO only (Tomer, Amit).
export default async function FeaturesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if ((prof as { role: string } | null)?.role !== 'CEO') redirect('/requests');
  return <TicketsBoard kind="FEATURE" items={await listAppRequests()} />;
}
