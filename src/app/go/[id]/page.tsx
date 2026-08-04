import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

/**
 * Role-neutral deep link for notifications. Every case-related notification
 * points here, and we forward each user to the case page their role can
 * actually open: painters use the painter view, everyone else the case detail.
 *
 * Why this exists: notifications fan out to CEOs and service advisors too, but a
 * single stored action_url (e.g. /painters/{id}) is not reachable by every
 * recipient — a service advisor hitting /painters/{id} was bounced to /cases,
 * losing the case. Forwarding by role fixes that for all roles at once.
 */
export default async function GoToCase({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = (data as { role?: string } | null)?.role;

  if (role === 'PAINTER') redirect(`/painters/${params.id}`);
  redirect(`/cases/${params.id}`);
}
