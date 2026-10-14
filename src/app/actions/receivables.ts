'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { PaymentRule } from '@/lib/collections';
import type { CollectionCase } from '@/app/actions/collections';

// Collections financial dashboard (/receivables, Amit 2026-10-14): the money
// side of collections — receivables, expected cash flow, aging, per insurer,
// collected, offsets, legal, collectors' output. CEO + users he approves
// (public.finance_viewers). Read through the service client after the check.

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function access(): Promise<{ userId: string; isCeo: boolean } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
  const p = data as { role: string; is_active: boolean } | null;
  if (!p || p.is_active === false) return null;
  if (p.role === 'CEO') return { userId: user.id, isCeo: true };
  const { data: v } = await supabase.from('finance_viewers').select('user_id').eq('user_id', user.id).maybeSingle();
  return v ? { userId: user.id, isCeo: false } : null;
}

export async function canViewReceivables(): Promise<boolean> {
  return !!(await access());
}

/** A closed job that no collector has opened yet ("behind the scenes"). */
export type UnopenedJob = { id: string; closed_on: string; payer: string; claim_type: string | null; amount: number };

export type ReceivablesData = {
  cases: CollectionCase[];
  unopened: UnopenedJob[];
  terms: Record<string, PaymentRule>;
  collectors: { id: string; name: string }[];
  isCeo: boolean;
  viewers: { id: string; name: string; role: string; granted: boolean }[];
  error?: string;
};

const NUMS = ['amount_due', 'vat_offset', 'reinstatement', 'claim_check_amount', 'received_amount', 'offset_amount', 'legal_claim_amount', 'legal_recovered_amount'] as const;

export async function getReceivables(): Promise<ReceivablesData> {
  const empty: ReceivablesData = { cases: [], unopened: [], terms: {}, collectors: [], isCeo: false, viewers: [] };
  const a = await access();
  if (!a) return { ...empty, error: 'אין הרשאה' };
  const db = serviceClient();
  if (!db) return { ...empty, error: 'שרת לא מוגדר' };
  const [casesRes, finRes, termRows, people, viewerRows, branches] = await Promise.all([
    db.from('collection_cases').select('*').limit(10000),
    db.from('finance_closures').select('id, closed_on, work_source, insurer, claim_type, amount_ours, vat_offset, reinstatement').limit(20000),
    db.from('insurer_payment_terms').select('insurer, agreement, mode, offset_months, pay_day, cutoff_day, notes, basis'),
    db.from('profiles').select('id, full_name, role, is_active'),
    db.from('finance_viewers').select('user_id'),
    db.from('branches').select('id, name'),
  ]);
  if (casesRes.error) return { ...empty, error: casesRes.error.message };
  type P = { id: string; full_name: string | null; role: string; is_active: boolean };
  const ppl = (people.data ?? []) as P[];
  const nameById = new Map(ppl.map((p) => [p.id, p.full_name]));
  const branchById = new Map(((branches.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const cases = ((casesRes.data ?? []) as Record<string, unknown>[]).map((c) => {
    const out = { ...c } as Record<string, unknown>;
    for (const k of NUMS) out[k] = c[k] == null ? null : Number(c[k]);
    out.assigned_name = nameById.get(c.assigned_to as string) ?? null;
    out.branch_name = c.branch_id ? branchById.get(c.branch_id as string) ?? null : null;
    return out as unknown as CollectionCase;
  });
  const opened = new Set(cases.map((c) => c.finance_closure_id).filter(Boolean));
  type F = { id: string; closed_on: string; work_source: string; insurer: string | null; claim_type: string | null; amount_ours: string | number; vat_offset: string | number | null; reinstatement: string | number | null };
  const unopened = ((finRes.data ?? []) as F[])
    .filter((f) => !opened.has(f.id))
    .map((f) => ({
      id: f.id,
      closed_on: f.closed_on,
      payer: f.work_source === 'SHIR' ? 'מוקד ש.י.ר' : f.work_source === 'IDF' ? 'צה"ל' : (f.insurer ?? '—'),
      claim_type: f.claim_type,
      amount: Number(f.amount_ours) - Number(f.vat_offset ?? 0) - Number(f.reinstatement ?? 0),
    }));
  const granted = new Set(((viewerRows.data ?? []) as { user_id: string }[]).map((v) => v.user_id));
  return {
    cases,
    unopened,
    terms: Object.fromEntries(((termRows.data ?? []) as PaymentRule[]).map((t) => [t.insurer, t])),
    collectors: ppl.filter((p) => p.role === 'COLLECTIONS' && p.is_active).map((p) => ({ id: p.id, name: p.full_name ?? '—' })),
    isCeo: a.isCeo,
    viewers: a.isCeo
      ? ppl.filter((p) => p.is_active && p.role !== 'CEO').map((p) => ({ id: p.id, name: p.full_name ?? '—', role: p.role, granted: granted.has(p.id) })).sort((x, y) => Number(y.granted) - Number(x.granted) || x.name.localeCompare(y.name, 'he'))
      : [],
  };
}

/** CEO approves / removes a person's access to this dashboard. */
export async function setReceivablesViewer(userId: string, on: boolean): Promise<{ error?: string; ok?: true }> {
  const a = await access();
  if (!a?.isCeo) return { error: 'רק המנכ"ל מאשר גישה' };
  const db = serviceClient();
  if (!db) return { error: 'שרת לא מוגדר' };
  const { error } = on
    ? await db.from('finance_viewers').upsert({ user_id: userId, granted_by: a.userId } as never, { onConflict: 'user_id' })
    : await db.from('finance_viewers').delete().eq('user_id', userId);
  if (error) return { error: error.message };
  revalidatePath('/receivables');
  return { ok: true };
}
