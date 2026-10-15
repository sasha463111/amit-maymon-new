import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { listAppRequests } from '@/app/actions/appRequests';
import { RequestsClient } from './RequestsClient';
import { getAdvisor } from '@/app/actions/advisor';

export const dynamic = 'force-dynamic';
// Claude calls run inside this page's server actions (photo reading / the
// advisor) and can take more than the default ~10 s — give them a minute.
export const maxDuration = 60;

// "💡 הצעות ייעול" — Amit's improvement requests and the answers (15/10). CEO only.
export default async function RequestsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if ((prof as { role: string } | null)?.role !== 'CEO') redirect('/');
  const [items, advisor] = await Promise.all([listAppRequests(), getAdvisor()]);
  return <RequestsClient items={items} advisor={advisor} />;
}
