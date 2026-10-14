'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { PaymentRule } from '@/lib/collections';

// Collections (Amit, 2026-10-14) — claims collectors (role COLLECTIONS:
// ספיר, גלית, ליטל) + CEO. Work happens in collection cases: a collector
// opens a case by plate ("פתיחת תיק"), the data is pulled from
// finance_closures and whatever is missing is typed; the case is hers.
// The pool of closed jobs stays behind the scenes. A collector sees only her
// own cases; the CEO sees all, per collector. Everything goes through the
// service client after the role check (collectors have no branches and
// finance_closures is CEO-only under RLS).

const ROLES = new Set(['COLLECTIONS', 'CEO']);
export type CollectionStatus = 'OPEN' | 'PARTIAL' | 'PAID' | 'DISPUTE' | 'LEGAL';
const STATUSES = new Set<CollectionStatus>(['OPEN', 'PARTIAL', 'PAID', 'DISPUTE', 'LEGAL']);
/** Final statuses — the case is closed (PARTIAL = paid with an offset). LEGAL closes when the lawyer's case closes. */
const FINAL = new Set<CollectionStatus>(['PAID', 'PARTIAL']);

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
  const { data } = await supabase.from('profiles').select('role, is_active, full_name').eq('id', user.id).maybeSingle();
  const p = data as { role: string; is_active: boolean; full_name: string | null } | null;
  if (!p || p.is_active === false || !ROLES.has(p.role)) return null;
  return { user, role: p.role, name: p.full_name };
}

const CASE_COLS =
  'id, finance_closure_id, assigned_to, opened_at, closed_at, branch_id, plate, customer_name, work_source, insurer, claim_type, case_closed_on, invoice_number, amount_due, vat_offset, reinstatement, claim_check_due_date, claim_check_amount, payment_approved_on, status, received_amount, received_on, partial_reason, offset_amount, note, legal_sent_on, legal_lawyer, legal_claim_amount, legal_closed_on, legal_recovered_amount, updated_at, updated_by';

export type CollectionCase = {
  id: string;
  finance_closure_id: string | null;
  assigned_to: string;
  assigned_name: string | null;
  opened_at: string;
  closed_at: string | null;
  branch_name: string | null;
  plate: string;
  customer_name: string | null;
  work_source: string;
  insurer: string | null;
  claim_type: string | null;
  case_closed_on: string | null;
  invoice_number: string | null;
  amount_due: number | null;
  vat_offset: number | null;
  reinstatement: number | null;
  claim_check_due_date: string | null;
  claim_check_amount: number | null;
  payment_approved_on: string | null;
  status: CollectionStatus;
  received_amount: number | null;
  received_on: string | null;
  partial_reason: string | null;
  offset_amount: number | null;
  note: string | null;
  legal_sent_on: string | null;
  legal_lawyer: string | null;
  legal_claim_amount: number | null;
  legal_closed_on: string | null;
  legal_recovered_amount: number | null;
  updated_at: string;
};

const NUMS = ['amount_due', 'vat_offset', 'reinstatement', 'claim_check_amount', 'received_amount', 'offset_amount', 'legal_claim_amount', 'legal_recovered_amount'] as const;

export async function listCollectionCases(): Promise<{
  cases: CollectionCase[];
  collectors: { id: string; name: string }[];
  terms: Record<string, PaymentRule>;
  isCeo: boolean;
  myId: string | null;
  error?: string;
}> {
  const ctx = await me();
  const empty = { cases: [], collectors: [], terms: {}, isCeo: false, myId: null };
  if (!ctx) return { ...empty, error: 'אין הרשאה' };
  const db = serviceClient();
  if (!db) return { ...empty, error: 'שרת לא מוגדר' };
  const isCeo = ctx.role === 'CEO';
  let q = db.from('collection_cases').select(CASE_COLS).order('opened_at', { ascending: false }).limit(5000);
  if (!isCeo) q = q.eq('assigned_to', ctx.user.id);
  const [casesRes, people, branches, termRows] = await Promise.all([
    q,
    db.from('profiles').select('id, full_name, role, is_active').in('role', ['COLLECTIONS', 'CEO']),
    db.from('branches').select('id, name'),
    db.from('insurer_payment_terms').select('insurer, agreement, mode, offset_months, pay_day, cutoff_day, notes'),
  ]);
  if (casesRes.error) return { ...empty, isCeo, myId: ctx.user.id, error: casesRes.error.message };
  const nameById = new Map(((people.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  const branchById = new Map(((branches.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const cases = ((casesRes.data ?? []) as Record<string, unknown>[]).map((c) => {
    const out = { ...c } as Record<string, unknown>;
    for (const k of NUMS) out[k] = c[k] == null ? null : Number(c[k]);
    out.assigned_name = nameById.get(c.assigned_to as string) ?? null;
    out.branch_name = c.branch_id ? branchById.get(c.branch_id as string) ?? null : null;
    return out as unknown as CollectionCase;
  });
  const collectors = ((people.data ?? []) as { id: string; full_name: string | null; role: string; is_active: boolean }[])
    .filter((p) => p.role === 'COLLECTIONS' && p.is_active)
    .map((p) => ({ id: p.id, name: p.full_name ?? '—' }));
  return {
    cases,
    collectors,
    terms: Object.fromEntries(((termRows.data ?? []) as PaymentRule[]).map((t) => [t.insurer, t])),
    isCeo,
    myId: ctx.user.id,
  };
}

/** Closed jobs for this plate in our data, for "פתיחת תיק" (already-opened ones are marked). */
export type PlateMatch = {
  finance_closure_id: string;
  case_closed_on: string;
  branch_id: string;
  branch_name: string | null;
  plate: string;
  customer_name: string | null;
  work_source: string;
  insurer: string | null;
  claim_type: string | null;
  invoice_number: string | null;
  amount_due: number;
  vat_offset: number | null;
  reinstatement: number | null;
  claim_check_due_date: string | null;
  claim_check_amount: number | null;
  taken_by: string | null;
};

export async function lookupPlateForCollection(plateInput: string): Promise<{ matches: PlateMatch[]; error?: string }> {
  const ctx = await me();
  if (!ctx) return { matches: [], error: 'אין הרשאה' };
  const plate = plateInput.replace(/\D/g, '');
  if (plate.length < 5) return { matches: [], error: 'מספר רכב לא תקין' };
  const db = serviceClient();
  if (!db) return { matches: [], error: 'שרת לא מוגדר' };
  const { data, error } = await db
    .from('finance_closures')
    .select('id, closed_on, branch_id, plate, customer_name, work_source, insurer, claim_type, invoice_number, amount_ours, vat_offset, reinstatement, claim_check_due_date, claim_check_amount')
    .eq('plate', plate)
    .order('closed_on', { ascending: false })
    .limit(10);
  if (error) return { matches: [], error: error.message };
  type F = { id: string; closed_on: string; branch_id: string; plate: string; customer_name: string | null; work_source: string; insurer: string | null; claim_type: string | null; invoice_number: string | null; amount_ours: string | number; vat_offset: string | number | null; reinstatement: string | number | null; claim_check_due_date: string | null; claim_check_amount: string | number | null };
  const rows = (data ?? []) as F[];
  const ids = rows.map((r) => r.id);
  const [taken, branches] = await Promise.all([
    ids.length ? db.from('collection_cases').select('finance_closure_id, assigned_to').in('finance_closure_id', ids) : Promise.resolve({ data: [] }),
    db.from('branches').select('id, name'),
  ]);
  const takenRows = (taken.data ?? []) as { finance_closure_id: string; assigned_to: string }[];
  const owners = Array.from(new Set(takenRows.map((t) => t.assigned_to)));
  const { data: names } = owners.length ? await db.from('profiles').select('id, full_name').in('id', owners) : { data: [] };
  const nameById = new Map(((names ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? '—']));
  const takenBy = new Map(takenRows.map((t) => [t.finance_closure_id, nameById.get(t.assigned_to) ?? '—']));
  const branchById = new Map(((branches.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const n = (v: string | number | null) => (v == null ? null : Number(v));
  return {
    matches: rows.map((r) => ({
      finance_closure_id: r.id,
      case_closed_on: r.closed_on,
      branch_id: r.branch_id,
      branch_name: branchById.get(r.branch_id) ?? null,
      plate: r.plate,
      customer_name: r.customer_name,
      work_source: r.work_source,
      insurer: r.insurer,
      claim_type: r.claim_type,
      invoice_number: r.invoice_number,
      amount_due: Number(r.amount_ours),
      vat_offset: n(r.vat_offset),
      reinstatement: n(r.reinstatement),
      claim_check_due_date: r.claim_check_due_date,
      claim_check_amount: n(r.claim_check_amount),
      taken_by: takenBy.get(r.id) ?? null,
    })),
  };
}

export type CaseInput = {
  plate: string;
  customer_name: string | null;
  work_source: string;
  insurer: string | null;
  claim_type: string | null;
  case_closed_on: string | null;
  invoice_number: string | null;
  amount_due: number | null;
  vat_offset: number | null;
  reinstatement: number | null;
  claim_check_due_date: string | null;
  claim_check_amount: number | null;
};

const isDate = (v: string | null | undefined) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
const okMoney = (v: number | null | undefined) => v == null || (Number.isFinite(v) && v >= 0 && v <= 10_000_000);
const txt = (v: string | null | undefined, max = 200) => (v ?? '').trim().slice(0, max) || null;

/** "פתיחת תיק" — the case is assigned to whoever opens it (the CEO may assign it to a collector). */
export async function openCollectionCase(
  input: CaseInput & { finance_closure_id: string | null; assign_to?: string | null },
): Promise<{ error?: string; ok?: true; id?: string }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  const db = serviceClient();
  if (!db) return { error: 'שרת לא מוגדר' };
  const plate = (input.plate ?? '').replace(/\D/g, '');
  if (plate.length < 5) return { error: 'מספר רכב לא תקין' };
  if (!['DIRECT', 'SHIR', 'IDF'].includes(input.work_source)) return { error: 'מקור עבודה לא תקין' };
  if (![input.case_closed_on, input.claim_check_due_date].every(isDate)) return { error: 'תאריך לא תקין' };
  if (![input.amount_due, input.vat_offset, input.reinstatement, input.claim_check_amount].every(okMoney)) return { error: 'סכום לא תקין' };

  let assignee = ctx.user.id;
  if (ctx.role === 'CEO' && input.assign_to) {
    const { data: who } = await db.from('profiles').select('id, role, is_active').eq('id', input.assign_to).maybeSingle();
    const w = who as { role: string; is_active: boolean } | null;
    if (!w || w.role !== 'COLLECTIONS' || !w.is_active) return { error: 'מסלקת לא תקינה' };
    assignee = input.assign_to;
  }

  let branchId: string | null = null;
  if (input.finance_closure_id) {
    const { data: fin } = await db.from('finance_closures').select('id, branch_id').eq('id', input.finance_closure_id).maybeSingle();
    if (!fin) return { error: 'הנתונים לא נמצאו' };
    branchId = (fin as { branch_id: string }).branch_id;
    const { data: existing } = await db.from('collection_cases').select('id').eq('finance_closure_id', input.finance_closure_id).maybeSingle();
    if (existing) return { error: 'לתיק הזה כבר נפתח תיק גבייה' };
  }

  const { data, error } = await db
    .from('collection_cases')
    .insert({
      finance_closure_id: input.finance_closure_id,
      assigned_to: assignee,
      branch_id: branchId,
      plate,
      customer_name: txt(input.customer_name, 120),
      work_source: input.work_source,
      insurer: input.work_source === 'SHIR' ? null : txt(input.insurer, 80),
      claim_type: txt(input.claim_type, 40),
      case_closed_on: input.case_closed_on || null,
      invoice_number: txt(input.invoice_number, 60),
      amount_due: input.amount_due,
      vat_offset: input.vat_offset,
      reinstatement: input.reinstatement,
      claim_check_due_date: input.claim_check_due_date || null,
      claim_check_amount: input.claim_check_amount,
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
    } as never)
    .select('id')
    .single();
  if (error) return { error: error.message.includes('uq_collection_cases_finance') ? 'לתיק הזה כבר נפתח תיק גבייה' : error.message };
  revalidatePath('/collections');
  return { ok: true, id: (data as { id: string }).id };
}

export type CaseUpdate = Partial<CaseInput> & {
  payment_approved_on?: string | null;
  status?: CollectionStatus;
  received_amount?: number | null;
  received_on?: string | null;
  partial_reason?: string | null;
  offset_amount?: number | null;
  note?: string | null;
  legal_sent_on?: string | null;
  legal_lawyer?: string | null;
  legal_claim_amount?: number | null;
  legal_closed_on?: string | null;
  legal_recovered_amount?: number | null;
};

export async function updateCollectionCase(id: string, u: CaseUpdate): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  const db = serviceClient();
  if (!db) return { error: 'שרת לא מוגדר' };
  const { data: row } = await db.from('collection_cases').select('id, assigned_to, closed_at').eq('id', id).maybeSingle();
  const cur = row as { assigned_to: string; closed_at: string | null } | null;
  if (!cur) return { error: 'לא נמצא' };
  if (ctx.role !== 'CEO' && cur.assigned_to !== ctx.user.id) return { error: 'התיק משויך למסלקת אחרת' };

  const status = u.status ?? undefined;
  if (status && !STATUSES.has(status)) return { error: 'סטטוס לא תקין' };
  const dates = [u.case_closed_on, u.claim_check_due_date, u.payment_approved_on, u.received_on, u.legal_sent_on, u.legal_closed_on];
  if (!dates.every(isDate)) return { error: 'תאריך לא תקין' };
  const money = [u.amount_due, u.vat_offset, u.reinstatement, u.claim_check_amount, u.received_amount, u.offset_amount, u.legal_claim_amount, u.legal_recovered_amount];
  if (!money.every(okMoney)) return { error: 'סכום לא תקין' };
  if (status === 'PARTIAL' && (!txt(u.partial_reason) || u.offset_amount == null)) return { error: 'בתשלום חלקי חובה סיבה וסכום קיזוז' };
  if ((status === 'PAID' || status === 'PARTIAL') && !u.received_on) return { error: 'נא להזין תאריך תשלום בפועל' };
  if (status === 'LEGAL' && !u.legal_sent_on) return { error: 'נא להזין תאריך העברה למחלקה המשפטית' };

  const patch: Record<string, unknown> = { updated_by: ctx.user.id, updated_at: new Date().toISOString() };
  const set = (k: keyof CaseUpdate, v: unknown) => {
    if (k in u) patch[k] = v;
  };
  set('customer_name', txt(u.customer_name, 120));
  set('work_source', u.work_source);
  set('insurer', txt(u.insurer, 80));
  set('claim_type', txt(u.claim_type, 40));
  set('case_closed_on', u.case_closed_on || null);
  set('invoice_number', txt(u.invoice_number, 60));
  for (const k of ['amount_due', 'vat_offset', 'reinstatement', 'claim_check_amount', 'received_amount', 'offset_amount', 'legal_claim_amount', 'legal_recovered_amount'] as const) set(k, u[k] ?? null);
  for (const k of ['claim_check_due_date', 'payment_approved_on', 'received_on', 'legal_sent_on', 'legal_closed_on'] as const) set(k, u[k] || null);
  set('partial_reason', txt(u.partial_reason, 500));
  set('note', txt(u.note, 500));
  set('legal_lawyer', txt(u.legal_lawyer, 80));
  if (status) {
    patch.status = status;
    // Closed when paid (fully or with an offset), or when the legal case is closed.
    const closes = FINAL.has(status) || (status === 'LEGAL' && !!u.legal_closed_on);
    patch.closed_at = closes ? cur.closed_at ?? new Date().toISOString() : null;
  }

  const { error } = await db.from('collection_cases').update(patch as never).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/collections');
  return { ok: true };
}

/** Payment agreement per payer (CEO only). rule null removes it. */
export async function saveInsurerTerm(insurer: string, rule: Omit<PaymentRule, 'insurer'> | null): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx || ctx.role !== 'CEO') return { error: 'רק המנכ"ל מעדכן הסכמי תשלום' };
  const name = insurer.trim().slice(0, 80);
  if (!name) return { error: 'חסר שם חברה' };
  const db = serviceClient();
  if (!db) return { error: 'שרת לא מוגדר' };
  if (rule == null) {
    const { error } = await db.from('insurer_payment_terms').delete().eq('insurer', name);
    if (error) return { error: error.message };
  } else {
    const int = (v: number | null, lo: number, hi: number) => v == null || (Number.isInteger(v) && v >= lo && v <= hi);
    if (rule.mode !== 'MONTHLY' && rule.mode !== 'BIWEEKLY') return { error: 'אופן תשלום לא תקין' };
    if (rule.mode === 'MONTHLY' && (rule.offset_months == null || rule.pay_day == null)) return { error: 'נא למלא חודשים ויום תשלום' };
    if (!int(rule.offset_months, 0, 12) || !int(rule.pay_day, 1, 31) || !int(rule.cutoff_day, 1, 31)) return { error: 'ערך לא תקין' };
    const { error } = await db.from('insurer_payment_terms').upsert(
      {
        insurer: name,
        agreement: (rule.agreement ?? '').trim().slice(0, 120) || null,
        mode: rule.mode,
        offset_months: rule.mode === 'MONTHLY' ? rule.offset_months : null,
        pay_day: rule.mode === 'MONTHLY' ? rule.pay_day : null,
        cutoff_day: rule.mode === 'MONTHLY' ? rule.cutoff_day : null,
        notes: (rule.notes ?? '').trim().slice(0, 300) || null,
        updated_by: ctx.user.id,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'insurer' },
    );
    if (error) return { error: error.message };
  }
  revalidatePath('/collections');
  return { ok: true };
}
