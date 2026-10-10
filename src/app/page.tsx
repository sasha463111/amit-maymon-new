import { redirect } from 'next/navigation';
import { getSignedInHome } from '@/lib/signedInHome';

const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true';

// Reads the session cookie, so it must never be prerendered or cached.
export const dynamic = 'force-dynamic';

// The installed app's start page. Signed-in users go straight to their home
// page; only people who are not signed in see the login form.
export default async function HomePage() {
  if (isPreview) redirect('/cases');
  const home = await getSignedInHome();
  redirect(home ?? '/login');
}
