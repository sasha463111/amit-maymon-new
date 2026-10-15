import { createHash } from 'crypto';
import { cookies } from 'next/headers';
import type { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isSmsConfigured } from '@/lib/sms.server';

// The SMS login step (2026-10-15) — shared by the dashboard layout (gate) and
// the /verify actions. A sign-in is "verified" when this Supabase session
// typed a correct code, or the phone carries a valid "remember me" cookie.

export const TRUSTED_COOKIE = 'tehila_td';
type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export function serviceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/** The current Supabase session id (from the access token the user already proved with getUser()). */
export async function currentSessionId(supabase: ServerSupabase): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { session_id?: string };
    return payload.session_id ?? null;
  } catch {
    return null;
  }
}

/** Does this sign-in still need the SMS code? (Only when required AND the provider is configured.) */
export async function needsSmsCode(supabase: ServerSupabase, userId: string, required: boolean): Promise<boolean> {
  if (!required || !isSmsConfigured()) return false;
  const db = serviceDb();
  if (!db) return false;
  const now = new Date().toISOString();
  const jar = await cookies();
  const device = jar.get(TRUSTED_COOKIE)?.value;
  if (device) {
    const { data } = await db.from('trusted_devices').select('id').eq('user_id', userId).eq('token_hash', sha256(device)).gt('expires_at', now).maybeSingle();
    if (data) return false;
  }
  const sid = await currentSessionId(supabase);
  if (!sid) return true;
  const { data } = await db.from('login_codes').select('id').eq('user_id', userId).eq('session_id', sid).not('verified_at', 'is', null).limit(1);
  return !(data ?? []).length;
}
