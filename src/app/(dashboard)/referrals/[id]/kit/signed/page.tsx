import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { canSendCustomerLink } from '@/lib/customerDocs';
import { getKitStatus } from '@/app/actions/customerDocLinks';
import { SignedClient } from './SignedClient';

export const dynamic = 'force-dynamic';

// The kit documents the customer signed through the link (stage 2, 15/10):
// each one as signed — the values, the signature, when and from where. Printable.
export default async function KitSignedPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!canSendCustomerLink((prof as { role: string } | null)?.role)) redirect(`/referrals/${params.id}`);
  const status = await getKitStatus(params.id);
  if (!status || !status.signed.length) redirect(`/referrals/${params.id}/kit`);
  return <SignedClient referralId={params.id} signed={status.signed} />;
}
