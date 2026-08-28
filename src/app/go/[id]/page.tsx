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
 *
 * searchParams (e.g. ?highlight=<id>) are forwarded as-is to whichever page
 * this lands on — see how it's constructed in NotificationsBell.tsx /
 * NotificationsList.tsx. A highlight id that doesn't mean anything on the
 * landing page (e.g. a painter_requests id forwarded to /cases/{id}, which
 * has no such concept) is harmless — every highlight consumer checks the id
 * actually matches something before acting on it, so a mismatch is a no-op.
 */
export default async function GoToCase({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = (data as { role?: string } | null)?.role;

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === 'string') qs.set(k, v);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';

  if (role === 'PAINTER') redirect(`/painters/${params.id}${suffix}`);
  redirect(`/cases/${params.id}${suffix}`);
}
