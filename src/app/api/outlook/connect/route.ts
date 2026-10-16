import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorizeUrl, newPkce, outlookConfigured } from '@/lib/outlook.server';
import { canUseOutlook } from '@/lib/outlook';

export const dynamic = 'force-dynamic';

/** "התחבר עם Microsoft": start the OAuth flow (PKCE verifier + state in short-lived httpOnly cookies). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL || 'https://amit-maymon-new-psi.vercel.app'));
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!canUseOutlook((prof as { role: string } | null)?.role) || !outlookConfigured()) return NextResponse.redirect('https://amit-maymon-new-psi.vercel.app/mail');
  const { verifier, challenge, state } = newPkce();
  const res = NextResponse.redirect(authorizeUrl(state, challenge, user.email ?? undefined));
  const opts = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/api/outlook', maxAge: 600 };
  res.cookies.set('ol_v', verifier, opts);
  res.cookies.set('ol_s', state, opts);
  return res;
}
