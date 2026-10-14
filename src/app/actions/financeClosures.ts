'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { WORK_SOURCE_LABEL } from '@/lib/finance';

// Finance data entry on the closure screen (Amit, 2026-10-14): Ilana fills the
// columns of her Excel; the row feeds the CEO-only /finance dashboard.
// finance_closures is CEO-only under RLS, so office staff read/write their
// case's row through the service client after the checks below.

const ENTRY_ROLES = new Set(['OFFICE', 'CEO']);

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Caller may enter finance data for this case: role + the case is visible to them (RLS). */
async function access(caseId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' as const };
  const { data: prof } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
  const p = prof as { role: string; is_active: boolean } | null;
  if (!p || p.is_active === false || !ENTRY_ROLES.has(p.role)) return { error: 'אין הרשאה' as const };
  const { data: c } = await supabase
    .from('cases')
    .select('id, branch_id, customer_name, cars(license_plate)')
    .eq('id', caseId)
    .maybeSingle();
  if (!c) return { error: 'התיק לא נמצא' as const };
  const row = c as { id: string; branch_id: string; customer_name: string | null; cars: { license_plate: string } | { license_plate: string }[] | null };
  const car = Array.isArray(row.cars) ? row.cars[0] : row.cars;
  return { user, caseRow: { id: row.id, branch_id: row.branch_id, customer_name: row.customer_name, plate: car?.license_plate ?? null } };
}

export type FinanceEntry = {
  closed_on: string;
  work_source: keyof typeof WORK_SOURCE_LABEL;
  insurer: string | null;
  claim_type: string | null;
  idf_category: string | null;
  appraiser: string | null;
  amount_ours: number | null;
  amount_shir: number | null;
  invoice_number: string | null;
  deductible: number | null;
  job_card_no: string | null;
};

export async function getFinanceEntry(caseId: string): Promise<{ entry: (FinanceEntry & { updated_at: string }) | null; error?: string }> {
  const a = await access(caseId);
  if ('error' in a) return { entry: null, error: a.error };
  const db = serviceClient();
  if (!db) return { entry: null, error: 'שרת לא מוגדר' };
  const { data } = await db
    .from('finance_closures')
    .select('closed_on, work_source, insurer, claim_type, idf_category, appraiser, amount_ours, amount_shir, invoice_number, deductible, job_card_no, updated_at')
    .eq('case_id', caseId)
    .maybeSingle();
  if (!data) return { entry: null };
  const d = data as Record<string, unknown>;
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    entry: {
      ...(d as unknown as FinanceEntry & { updated_at: string }),
      amount_ours: num(d.amount_ours),
      amount_shir: num(d.amount_shir),
      deductible: num(d.deductible),
    },
  };
}

export async function saveFinanceEntry(caseId: string, input: FinanceEntry): Promise<{ error?: string; ok?: true }> {
  const a = await access(caseId);
  if ('error' in a) return { error: a.error };
  const db = serviceClient();
  if (!db) return { error: 'שרת לא מוגדר' };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.closed_on ?? '')) return { error: 'תאריך סגירה לא תקין' };
  if (!(input.work_source in WORK_SOURCE_LABEL)) return { error: 'נא לבחור מקור עבודה' };
  const money = (v: number | null, label: string, required = false) => {
    if (v == null || Number.isNaN(v)) return required ? `נא להזין ${label}` : null;
    if (v < 0 || v > 10_000_000) return `${label} לא תקין`;
    return null;
  };
  const err =
    money(input.amount_ours, 'סכום חשבונית', true) ?? money(input.amount_shir, 'סכום ללא הנחות') ?? money(input.deductible, 'השתתפות עצמית');
  if (err) return { error: err };
  const t = (v: string | null, max = 120) => (v ?? '').trim().slice(0, max) || null;

  const row = {
    case_id: caseId,
    branch_id: a.caseRow.branch_id,
    plate: a.caseRow.plate,
    customer_name: a.caseRow.customer_name,
    closed_on: input.closed_on,
    work_source: input.work_source,
    insurer: input.work_source === 'SHIR' ? null : t(input.insurer),
    claim_type: t(input.claim_type, 40),
    idf_category: input.work_source === 'IDF' ? t(input.idf_category, 40) : null,
    appraiser: t(input.appraiser),
    amount_ours: input.amount_ours,
    amount_shir: input.amount_shir,
    invoice_number: t(input.invoice_number, 60),
    deductible: input.deductible,
    job_card_no: t(input.job_card_no, 60),
    updated_by: a.user.id,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await db.from('finance_closures').select('id').eq('case_id', caseId).maybeSingle();
  const { error } = existing
    ? await db.from('finance_closures').update(row as never).eq('id', (existing as { id: string }).id)
    : await db.from('finance_closures').insert({ ...row, source: 'MANUAL', created_by: a.user.id } as never);
  if (error) return { error: error.message };
  revalidatePath(`/closure/${caseId}`);
  revalidatePath('/finance');
  return { ok: true };
}
