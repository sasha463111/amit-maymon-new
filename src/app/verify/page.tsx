import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSignedInHome } from '@/lib/signedInHome';
import { needsSmsCode } from '@/lib/loginVerify.server';
import { VerifyClient } from './VerifyClient';

export const dynamic = 'force-dynamic';

// The SMS login step (2026-10-15). Outside the dashboard layout on purpose —
// that layout is what sends people here.
export default async function VerifyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data } = await supabase.from('profiles').select('sms_required, full_name').eq('id', user.id).maybeSingle();
  const p = data as { sms_required: boolean; full_name: string | null } | null;
  if (!(await needsSmsCode(supabase, user.id, !!p?.sms_required))) redirect((await getSignedInHome()) ?? '/');
  return <VerifyClient name={p?.full_name ?? null} />;
}
