'use server';

import { randomBytes, randomInt } from 'crypto';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getSignedInHome } from '@/lib/signedInHome';
import { sendSms } from '@/lib/sms.server';
import { TRUSTED_COOKIE, currentSessionId, serviceDb, sha256 } from '@/lib/loginVerify.server';

// The SMS login step (2026-10-15): after the password, a 6-digit code by SMS
// to the person's mobile (staff_phones). 5-minute codes, 5 tries each, at most
// one SMS a minute and 5 per hour. "Remember this phone" = a 30-day cookie.

const CODE_MINUTES = 5;
const MAX_TRIES = 5;
const REMEMBER_DAYS = 30;
const SITE_HOST = 'amit-maymon-new-psi.vercel.app';

const pepper = () => process.env.LOGIN_CODE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const hashCode = (userId: string, code: string) => sha256(`${pepper()}:${userId}:${code}`);
const mask = (p: string) => `${p.slice(0, 3)}-***${p.slice(-4)}`;

async function who() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = serviceDb();
  if (!db) return null;
  const sid = await currentSessionId(supabase);
  return { supabase, user, db, sid };
}

export async function requestLoginCode(): Promise<{ ok?: true; sentTo?: string; error?: string; noPhone?: boolean }> {
  const c = await who();
  if (!c || !c.sid) return { error: 'לא מחובר' };
  const { data: ph } = await c.db.from('staff_phones').select('phone').eq('user_id', c.user.id).maybeSingle();
  const phone = (ph as { phone: string } | null)?.phone?.replace(/\D/g, '');
  if (!phone) return { noPhone: true, error: 'אין מספר נייד במערכת. פנה לעמית כדי שיוסיף.' };

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { data: recent } = await c.db.from('login_codes').select('created_at').eq('user_id', c.user.id).gt('created_at', hourAgo).order('created_at', { ascending: false });
  const rows = (recent ?? []) as { created_at: string }[];
  if (rows.length >= 5) return { error: 'נשלחו יותר מדי קודים בשעה האחרונה. נסה שוב מאוחר יותר או פנה לעמית.' };
  if (rows[0] && Date.now() - new Date(rows[0].created_at).getTime() < 60_000) return { ok: true, sentTo: mask(phone) }; // the last one is still on its way

  const code = String(randomInt(100000, 1000000));
  const { error } = await c.db.from('login_codes').insert({
    user_id: c.user.id,
    session_id: c.sid,
    code_hash: hashCode(c.user.id, code),
    expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
  } as never);
  if (error) return { error: 'שגיאה ביצירת הקוד' };
  // Last line = the standard one-time-code format, so Android offers to fill it in.
  const sent = await sendSms(phone, `קוד הכניסה שלך לתהילה: ${code}\n\n@${SITE_HOST} #${code}`);
  if (sent.error) return { error: sent.error };
  return { ok: true, sentTo: mask(phone) };
}

export async function verifyLoginCode(code: string, remember: boolean): Promise<{ ok?: true; home?: string; error?: string }> {
  const c = await who();
  if (!c || !c.sid) return { error: 'לא מחובר' };
  const clean = (code ?? '').replace(/\D/g, '');
  if (clean.length !== 6) return { error: 'הקוד הוא 6 ספרות' };
  const { data } = await c.db
    .from('login_codes')
    .select('id, code_hash, expires_at, attempts')
    .eq('user_id', c.user.id)
    .eq('session_id', c.sid)
    .is('verified_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { id: string; code_hash: string; expires_at: string; attempts: number } | null;
  if (!row) return { error: 'אין קוד פעיל — לוחצים "שליחת קוד חדש"' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { error: 'הקוד פג תוקף — לוחצים "שליחת קוד חדש"' };
  if (row.attempts >= MAX_TRIES) return { error: 'יותר מדי ניסיונות — לוחצים "שליחת קוד חדש"' };
  if (row.code_hash !== hashCode(c.user.id, clean)) {
    await c.db.from('login_codes').update({ attempts: row.attempts + 1 } as never).eq('id', row.id);
    return { error: 'הקוד לא נכון' };
  }
  await c.db.from('login_codes').update({ verified_at: new Date().toISOString() } as never).eq('id', row.id);

  if (remember) {
    const token = randomBytes(32).toString('hex');
    const ua = (await headers()).get('user-agent') ?? '';
    await c.db.from('trusted_devices').insert({
      user_id: c.user.id,
      token_hash: sha256(token),
      label: ua.slice(0, 120),
      expires_at: new Date(Date.now() + REMEMBER_DAYS * 86_400_000).toISOString(),
    } as never);
    (await cookies()).set(TRUSTED_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: REMEMBER_DAYS * 86_400 });
  }
  return { ok: true, home: (await getSignedInHome()) ?? '/' };
}
