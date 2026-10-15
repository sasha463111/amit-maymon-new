import { redirect } from 'next/navigation';
import { getMfaState } from '@/app/actions/mfa';
import { getSignedInHome } from '@/lib/signedInHome';
import { MfaClient } from './MfaClient';

export const dynamic = 'force-dynamic';

// Two-step login (Amit, 2026-10-15): enrol Duo Mobile once, then the code on
// every new sign-in. Outside the dashboard layout on purpose — that layout is
// what sends people here.
export default async function MfaPage() {
  const state = await getMfaState();
  if (!state) redirect('/login');
  if (state.enrolled && state.level === 'aal2') redirect((await getSignedInHome()) ?? '/');
  return <MfaClient enrolled={state.enrolled} name={state.name} />;
}
