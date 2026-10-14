'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { looksLikeCompany, normalizeId, validEmail, validIsraeliId, type VatShare, type VatStatus } from '@/lib/customerTax';

// Customer ID / email + VAT-file check on a repair case (Amit, 2026-10-14).
// Who: the people who open and run cases (not painters / warehouse). The case
// must be visible to the user under RLS (branch); the write then goes through
// the service client, limited to these columns.

const ROLES = new Set(['CEO', 'SERVICE_MANAGER', 'SERVICE_ADVISOR', 'OFFICE', 'ACCOUNTANT']);
const STATUSES = new Set<VatStatus>(['NONE', 'DEALER', 'COMPANY']);
const SHARES = new Set<VatShare>(['THIRD', 'TWO_THIRDS', 'FULL']);

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
  const p = data as { role: string; is_active: boolean } | null;
  if (!p || p.is_active === false || !ROLES.has(p.role)) return null;
  const db = serviceClient();
  if (!db) return null;
  return { supabase, user, db };
}

export type PreviousVat = { vat_status: VatStatus; vat_share: VatShare | null; checked_at: string | null; cpa_received: boolean; cases: number };
export type CustomerTax = {
  customer_name: string | null;
  id_number: string | null;
  email: string | null;
  vat_status: VatStatus | null;
  vat_share: VatShare | null;
  checked_at: string | null;
  checked_by: string | null;
  cpa_requested_at: string | null;
  cpa_received_at: string | null;
  company_hint: boolean;
  previous: PreviousVat | null;
};

/** The answer we already have for this ID from earlier cases (any branch) — status only, no other details. */
async function previousFor(db: NonNullable<ReturnType<typeof serviceClient>>, idNumber: string, exceptCase?: string): Promise<PreviousVat | null> {
  if (!validIsraeliId(idNumber)) return null;
  let q = db.from('cases').select('id, vat_status, vat_share, vat_checked_at, vat_cpa_received_at').eq('customer_id_number', normalizeId(idNumber)).not('vat_status', 'is', null).order('vat_checked_at', { ascending: false, nullsFirst: false }).limit(20);
  if (exceptCase) q = q.neq('id', exceptCase);
  const rows = ((await q).data ?? []) as { vat_status: VatStatus; vat_share: VatShare | null; vat_checked_at: string | null; vat_cpa_received_at: string | null }[];
  if (!rows.length) return null;
  const r = rows[0];
  return { vat_status: r.vat_status, vat_share: r.vat_share, checked_at: r.vat_checked_at, cpa_received: !!r.vat_cpa_received_at, cases: rows.length };
}

export async function getCustomerTax(caseId: string): Promise<CustomerTax | null> {
  const c = await ctx();
  if (!c) return null;
  // RLS: only a case this user may see.
  const { data } = await c.supabase
    .from('cases')
    .select('customer_name, customer_id_number, customer_email, vat_status, vat_share, vat_checked_at, vat_checked_by, vat_cpa_requested_at, vat_cpa_received_at')
    .eq('id', caseId)
    .maybeSingle();
  type R = { customer_name: string | null; customer_id_number: string | null; customer_email: string | null; vat_status: VatStatus | null; vat_share: VatShare | null; vat_checked_at: string | null; vat_checked_by: string | null; vat_cpa_requested_at: string | null; vat_cpa_received_at: string | null };
  const r = data as R | null;
  if (!r) return null;
  const [prev, who] = await Promise.all([
    r.customer_id_number ? previousFor(c.db, r.customer_id_number, caseId) : Promise.resolve(null),
    r.vat_checked_by ? c.db.from('profiles').select('full_name').eq('id', r.vat_checked_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    customer_name: r.customer_name,
    id_number: r.customer_id_number,
    email: r.customer_email,
    vat_status: r.vat_status,
    vat_share: r.vat_share,
    checked_at: r.vat_checked_at,
    checked_by: (who.data as { full_name: string | null } | null)?.full_name ?? null,
    cpa_requested_at: r.vat_cpa_requested_at,
    cpa_received_at: r.vat_cpa_received_at,
    company_hint: looksLikeCompany(r.customer_name, r.customer_id_number),
    previous: prev,
  };
}

/** For the "פתיחת תיק" dialog: what we know about this ID already. */
export async function lookupPreviousVat(idNumber: string): Promise<{ previous: PreviousVat | null; valid: boolean; company: boolean }> {
  const c = await ctx();
  const valid = validIsraeliId(idNumber);
  if (!c || !valid) return { previous: null, valid, company: looksLikeCompany(null, idNumber) };
  return { previous: await previousFor(c.db, idNumber), valid, company: looksLikeCompany(null, idNumber) };
}

export type CustomerTaxPatch = {
  id_number?: string | null;
  email?: string | null;
  vat_status?: VatStatus | null;
  vat_share?: VatShare | null;
  cpa_requested?: boolean;
  cpa_received?: boolean;
};

export async function saveCustomerTax(caseId: string, p: CustomerTaxPatch): Promise<{ error?: string; ok?: true }> {
  const c = await ctx();
  if (!c) return { error: 'אין הרשאה' };
  const { data: visible } = await c.supabase.from('cases').select('id').eq('id', caseId).maybeSingle();
  if (!visible) return { error: 'התיק לא נמצא' };

  const patch: Record<string, unknown> = {};
  const now = new Date().toISOString();
  if ('id_number' in p) {
    const raw = (p.id_number ?? '').trim();
    if (raw && !validIsraeliId(raw)) return { error: 'מספר ת״ז / ח.פ לא תקין (ספרת ביקורת)' };
    patch.customer_id_number = raw ? normalizeId(raw) : null;
  }
  if ('email' in p) {
    const e = (p.email ?? '').trim().toLowerCase();
    if (e && !validEmail(e)) return { error: 'כתובת מייל לא תקינה' };
    patch.customer_email = e || null;
  }
  if ('vat_status' in p) {
    if (p.vat_status && !STATUSES.has(p.vat_status)) return { error: 'סטטוס לא תקין' };
    patch.vat_status = p.vat_status ?? null;
    patch.vat_checked_at = p.vat_status ? now : null;
    patch.vat_checked_by = p.vat_status ? c.user.id : null;
    if (p.vat_status === 'NONE') {
      patch.vat_share = null;
      patch.vat_cpa_requested_at = null;
      patch.vat_cpa_received_at = null;
    }
  }
  if ('vat_share' in p) {
    if (p.vat_share && !SHARES.has(p.vat_share)) return { error: 'שיעור קיזוז לא תקין' };
    patch.vat_share = p.vat_share ?? null;
  }
  if ('cpa_requested' in p) patch.vat_cpa_requested_at = p.cpa_requested ? now : null;
  if ('cpa_received' in p) patch.vat_cpa_received_at = p.cpa_received ? now : null;
  if (!Object.keys(patch).length) return { ok: true };

  const { error } = await c.db.from('cases').update(patch as never).eq('id', caseId);
  if (error) return { error: error.message };
  revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}
