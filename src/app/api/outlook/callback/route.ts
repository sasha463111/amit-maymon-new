import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { completeConnection } from '@/lib/outlook.server';

export const dynamic = 'force-dynamic';

const BACK = 'https://amit-maymon-new-psi.vercel.app/mail';

/** Microsoft redirects back here: check state, exchange the code (PKCE), store the encrypted token. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const fail = (m: string) => {
    const r = NextResponse.redirect(`${BACK}?err=${encodeURIComponent(m)}`);
    r.cookies.delete({ name: 'ol_v', path: '/api/outlook' });
    r.cookies.delete({ name: 'ol_s', path: '/api/outlook' });
    return r;
  };
  if (url.searchParams.get('error')) return fail(url.searchParams.get('error_description')?.slice(0, 160) || 'ההתחברות בוטלה');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const verifier = req.cookies.get('ol_v')?.value;
  if (!code || !state || !verifier || state !== req.cookies.get('ol_s')?.value) return fail('ההתחברות פגה — נסו שוב');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('לא מחובר למערכת');
  const r = await completeConnection(user.id, code, verifier);
  if (!r.ok) return fail(r.error);
  const ok = NextResponse.redirect(`${BACK}?connected=1`);
  ok.cookies.delete({ name: 'ol_v', path: '/api/outlook' });
  ok.cookies.delete({ name: 'ol_s', path: '/api/outlook' });
  return ok;
}
