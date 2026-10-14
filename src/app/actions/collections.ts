'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// Collections screen (Amit, 2026-10-14) — claims collectors (role COLLECTIONS:
// ספיר, גלית, ליטל) + CEO. finance_closures is CEO-only under RLS and the
// collectors have no branches, so everything is read and written here through
// the service client, after the role check, and ONLY the fields Amit allowed:
// invoice amount to pay, the third-party claims cheque (due date + amount),
// VAT offset, reinstatement — plus what identifies the case.

const ROLES = new Set(['COLLECTIONS', 'CEO']);
export type CollectionStatus = 'OPEN' | 'PARTIAL' | 'PAID' | 'DISPUTE';
const STATUSES = new Set<CollectionStatus>(['OPEN', 'PARTIAL', 'PAID', 'DISPUTE']);

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function me() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
  const p = data as { role: string; is_active: boolean } | null;
  if (!p || p.is_active === false || !ROLES.has(p.role)) return null;
  return { user, role: p.role };
}

export type CollectionRow = {
  id: string;
  closed_on: string;
  branch_name: string | null;
  plate: string | null;
  customer_name: string | null;
  insurer: string | null;
  work_source: string;
  claim_type: string | null;
  invoice_number: string | null;
  amount_ours: number;
  claim_check_due_date: string | null;
  claim_check_amount: number | null;
  vat_offset: number | null;
  reinstatement: number | null;
  status: CollectionStatus;
  received_amount: number | null;
  received_on: string | null;
  note: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
};

export async function listCollections(): Promise<{ rows: CollectionRow[]; error?: string }> {
  const ctx = await me();
  if (!ctx) return { rows: [], error: 'אין הרשאה' };
  const db = serviceClient();
  if (!db) return { rows: [], error: 'שרת לא מוגדר' };
  const [fin, col, branches] = await Promise.all([
    db
      .from('finance_closures')
      .select('id, closed_on, branch_id, plate, customer_name, insurer, work_source, claim_type, invoice_number, amount_ours, claim_check_due_date, claim_check_amount, vat_offset, reinstatement')
      .order('closed_on', { ascending: false })
      .limit(5000),
    db.from('finance_collections').select('finance_closure_id, status, received_amount, received_on, note, updated_at, updated_by').limit(5000),
    db.from('branches').select('id, name'),
  ]);
  if (fin.error) return { rows: [], error: fin.error.message };
  type F = { id: string; closed_on: string; branch_id: string; plate: string | null; customer_name: string | null; insurer: string | null; work_source: string; claim_type: string | null; invoice_number: string | null; amount_ours: string | number; claim_check_due_date: string | null; claim_check_amount: string | number | null; vat_offset: string | number | null; reinstatement: string | number | null };
  type C = { finance_closure_id: string; status: CollectionStatus; received_amount: string | number | null; received_on: string | null; note: string | null; updated_at: string; updated_by: string | null };
  const colById = new Map(((col.data ?? []) as C[]).map((c) => [c.finance_closure_id, c]));
  const branchById = new Map(((branches.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const editors = Array.from(new Set(((col.data ?? []) as C[]).map((c) => c.updated_by).filter((x): x is string => !!x)));
  const { data: names } = editors.length ? await db.from('profiles').select('id, full_name').in('id', editors) : { data: [] };
  const nameById = new Map(((names ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  const n = (v: string | number | null) => (v == null ? null : Number(v));
  return {
    rows: ((fin.data ?? []) as F[]).map((f) => {
      const c = colById.get(f.id);
      return {
        id: f.id,
        closed_on: f.closed_on,
        branch_name: branchById.get(f.branch_id) ?? null,
        plate: f.plate,
        customer_name: f.customer_name,
        insurer: f.insurer,
        work_source: f.work_source,
        claim_type: f.claim_type,
        invoice_number: f.invoice_number,
        amount_ours: Number(f.amount_ours),
        claim_check_due_date: f.claim_check_due_date,
        claim_check_amount: n(f.claim_check_amount),
        vat_offset: n(f.vat_offset),
        reinstatement: n(f.reinstatement),
        status: c?.status ?? 'OPEN',
        received_amount: n(c?.received_amount ?? null),
        received_on: c?.received_on ?? null,
        note: c?.note ?? null,
        updated_at: c?.updated_at ?? null,
        updated_by_name: c?.updated_by ? nameById.get(c.updated_by) ?? null : null,
      };
    }),
  };
}

export async function saveCollection(
  id: string,
  input: { status: CollectionStatus; received_amount: number | null; received_on: string | null; note: string | null },
): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  if (!STATUSES.has(input.status)) return { error: 'סטטוס לא תקין' };
  if (input.received_amount != null && (!Number.isFinite(input.received_amount) || input.received_amount < 0 || input.received_amount > 10_000_000)) {
    return { error: 'סכום לא תקין' };
  }
  if (input.received_on && !/^\d{4}-\d{2}-\d{2}$/.test(input.received_on)) return { error: 'תאריך לא תקין' };
  const db = serviceClient();
  if (!db) return { error: 'שרת לא מוגדר' };
  const { data: fin } = await db.from('finance_closures').select('id').eq('id', id).maybeSingle();
  if (!fin) return { error: 'לא נמצא' };
  const { error } = await db.from('finance_collections').upsert(
    {
      finance_closure_id: id,
      status: input.status,
      received_amount: input.received_amount,
      received_on: input.received_on || null,
      note: (input.note ?? '').trim().slice(0, 500) || null,
      updated_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: 'finance_closure_id' },
  );
  if (error) return { error: error.message };
  revalidatePath('/collections');
  return { ok: true };
}
