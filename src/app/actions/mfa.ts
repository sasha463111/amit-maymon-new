'use server';

import { createClient } from '@/lib/supabase/server';
import { getSignedInHome } from '@/lib/signedInHome';

// Two-step login with Duo Mobile (Amit, 2026-10-15: "שיהיה לכולם"). Supabase
// MFA, TOTP: the person scans a QR code once in Duo Mobile ("Add account →
// Use QR code"), then types the 6-digit code on every new sign-in. Who must
// use it: profiles.mfa_required (set by the CEO in settings); the dashboard
// layout sends anyone required and not at aal2 to /mfa. All calls run with
// the person's own session (cookies) — nothing here acts for anyone else.

export type MfaState = { required: boolean; enrolled: boolean; level: string | null; name: string | null };

export async function getMfaState(): Promise<MfaState | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: prof }, { data: factors }, { data: aal }] = await Promise.all([
    supabase.from('profiles').select('mfa_required, full_name').eq('id', user.id).maybeSingle(),
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const p = prof as { mfa_required: boolean; full_name: string | null } | null;
  return {
    required: !!p?.mfa_required,
    enrolled: (factors?.totp ?? []).some((f) => f.status === 'verified'),
    level: aal?.currentLevel ?? null,
    name: p?.full_name ?? null,
  };
}

/** Start enrolment: a fresh QR code (unfinished earlier attempts are removed first). */
export async function startMfaEnroll(): Promise<{ factorId?: string; qr?: string; secret?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if ((factors?.totp ?? []).some((f) => f.status === 'verified')) return { error: 'כבר מחובר ל-Duo. אם החלפת טלפון — עמית מאפס.' };
  for (const f of factors?.all ?? []) {
    if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'Tehila CRM',
    friendlyName: `Duo ${new Date().toISOString().slice(0, 16)}`,
  });
  if (error || !data) return { error: error?.message ?? 'ההרשמה נכשלה' };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

function cleanCode(code: string) {
  return (code ?? '').replace(/\D/g, '').slice(0, 6);
}

/** Finish enrolment with the first code from Duo. */
export async function verifyMfaEnroll(factorId: string, code: string): Promise<{ ok?: true; home?: string; error?: string }> {
  const supabase = await createClient();
  const c = cleanCode(code);
  if (c.length !== 6) return { error: 'הקוד הוא 6 ספרות' };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: c });
  if (error) return { error: 'הקוד לא נכון או שפג תוקפו — מקלידים את הקוד שמופיע עכשיו ב-Duo' };
  return { ok: true, home: (await getSignedInHome()) ?? '/' };
}

/** Every new sign-in: the current code from Duo. */
export async function verifyMfaLogin(code: string): Promise<{ ok?: true; home?: string; error?: string }> {
  const supabase = await createClient();
  const c = cleanCode(code);
  if (c.length !== 6) return { error: 'הקוד הוא 6 ספרות' };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = (factors?.totp ?? []).find((f) => f.status === 'verified');
  if (!factor) return { error: 'עוד לא חיברת את Duo' };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: c });
  if (error) return { error: 'הקוד לא נכון או שפג תוקפו — מקלידים את הקוד שמופיע עכשיו ב-Duo' };
  return { ok: true, home: (await getSignedInHome()) ?? '/' };
}
