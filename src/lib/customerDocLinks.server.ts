import 'server-only';
import { createHash, randomBytes } from 'crypto';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// Customer documents link — server side. Only the SHA-256 of the token is
// stored, so a DB leak does not expose working links.

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface ResolvedLink {
  link: {
    id: string;
    referral_id: string;
    created_by: string | null;
    expires_at: string;
    revoked_at: string | null;
    opened_at: string | null;
    consent_at: string | null;
    completed_at: string | null;
    /** Claim kit to sign (stage 2, 15/10): document ids + our prefilled values. */
    kit_docs: string[] | null;
    kit_values: Record<string, string> | null;
    kit_signed_at: string | null;
  };
  referral: { id: string; customer_name: string | null; plate_number: string | null; claim_type: string | null; branch_id: string };
}

export type LinkState = { ok: true; value: ResolvedLink } | { ok: false; reason: 'invalid' | 'expired' | 'revoked' | 'unavailable' };

/** Looks the token up. Never says more than "invalid" for unknown tokens. */
export async function resolveToken(token: string | null | undefined): Promise<LinkState> {
  if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return { ok: false, reason: 'invalid' };
  const db = serviceClient();
  if (!db) return { ok: false, reason: 'unavailable' };
  const { data } = await db
    .from('customer_doc_links')
    .select('id, referral_id, created_by, expires_at, revoked_at, opened_at, consent_at, completed_at, kit_docs, kit_values, kit_signed_at, referrals(id, customer_name, plate_number, claim_type, branch_id)')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (!data) return { ok: false, reason: 'invalid' };
  const row = data as ResolvedLink['link'] & { referrals: ResolvedLink['referral'] | ResolvedLink['referral'][] | null };
  const referral = Array.isArray(row.referrals) ? row.referrals[0] : row.referrals;
  if (!referral) return { ok: false, reason: 'invalid' };
  if (row.revoked_at) return { ok: false, reason: 'revoked' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' };
  const { referrals: _r, ...link } = row;
  void _r;
  return { ok: true, value: { link, referral } };
}

export function requestMeta(headers: Headers): { ip: string | null; ua: string | null } {
  const ip = (headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || headers.get('x-real-ip');
  return { ip: ip || null, ua: (headers.get('user-agent') ?? '').slice(0, 400) || null };
}

/** The official production address (see OFFICIAL_HOST in src/middleware.ts). */
export const APP_ORIGIN = 'https://amit-maymon-new-psi.vercel.app';
