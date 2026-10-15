import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { listAppRequests } from '@/app/actions/appRequests';
import { RequestsClient } from './RequestsClient';
import { getAdvisor } from '@/app/actions/advisor';

export const dynamic = 'force-dynamic';
// Claude calls run inside this page's server actions (photo reading / the
// advisor) and can take more than the default ~10 s — give them a minute.
export const maxDuration = 60;

// "💡 הצעות ייעול" / "הערות לשיפור" — improvement notes and the answers (15/10).
// Everyone: staff see their own notes; a CEO sees all of them + the advisor chat.
export default async function RequestsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isCeo = (prof as { role: string } | null)?.role === 'CEO';
  const [items, advisor] = await Promise.all([listAppRequests(), isCeo ? getAdvisor() : Promise.resolve(null)]);
  return <RequestsClient items={items} advisor={advisor} isCeo={isCeo} />;
}
