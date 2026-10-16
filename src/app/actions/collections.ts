'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { PaymentRule } from '@/lib/collections';
import { defaultStageDays, israelTimeToIso, israelWorkDateIn, stageRule } from '@/lib/collectionStages';
import { lookupVehicle } from '@/lib/vehicleLookup.server';

const LEGAL_STAGE = 'טיפול משפטי';

// Collections (Amit, 2026-10-14) — claims collectors (role COLLECTIONS:
// ספיר, גלית, ליטל) + CEO. Work happens in collection cases: a collector
// opens a case by plate ("פתיחת תיק"), the data is pulled from
// finance_closures and whatever is missing is typed; the case is hers.
// The pool of closed jobs stays behind the scenes. A collector sees only her
// own cases; the CEO sees all, per collector. Everything goes through the
// service client after the role check (collectors have no branches and
// finance_closures is CEO-only under RLS).

const ROLES = new Set(['COLLECTIONS', 'CEO', 'ACCOUNTANT']);
/** See every collector's cases, assign, update any case (the bookkeeper too). */
const SUPERVISORS = new Set(['CEO', 'ACCOUNTANT']);
export type CollectionStatus = 'OPEN' | 'PARTIAL' | 'PAID' | 'DISPUTE' | 'LEGAL' | 'BLOCKED';
const STATUSES = new Set<CollectionStatus>(['OPEN', 'PARTIAL', 'PAID', 'DISPUTE', 'LEGAL', 'BLOCKED']);
/** Final statuses — the case is closed (PARTIAL = paid with an offset). LEGAL closes when the lawyer's case closes. */

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
  const { data } = await supabase.from('profiles').select('role, is_active, full_name, collections_manager').eq('id', user.id).maybeSingle();
  const p = data as { role: string; is_active: boolean; full_name: string | null; collections_manager: boolean } | null;
  if (!p || p.is_active === false || !ROLES.has(p.role)) return null;
  // Sees every collector's claims: CEO, bookkeeper, and the claims department
  // manager (Galit — Discussion #2). Payment agreements stay CEO + bookkeeper.
  const supervisor = SUPERVISORS.has(p.role) || (p.role === 'COLLECTIONS' && !!p.collections_manager);
  return { user, role: p.role, name: p.full_name, supervisor };
}

const CASE_COLS =
  'id, finance_closure_id, assigned_to, opened_at, closed_at, branch_id, plate, customer_name, work_source, insurer, claim_type, case_closed_on, invoice_number, amount_due, vat_offset, reinstatement, claim_check_due_date, claim_check_amount, payment_approved_on, status, received_amount, received_on, partial_reason, offset_amount, note, legal_sent_on, legal_lawyer, legal_claim_amount, legal_closed_on, legal_recovered_amount, legal_reason, vehicle_type, updated_at, updated_by, ' +
  // the case file (20261014350000)
  'claim_number, claim_stage, event_date, customer_phone, claimed_amount, approved_amount, appraiser_name, appraiser_phone, appraiser_email, appraiser_damage, appraiser_fee, depreciation, deductible, salvage_value, extra_expenses, insurer_handler, insurer_handler_phone, insurer_handler_email, tp_plate, tp_insurer, tp_claim_number, tp_owner_name, tp_owner_phone, legal_claim_number, appraiser_note, external_ref, source, case_id, referral_id';

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
  legal_reason: string | null;
  /** Car type (Ministry of Transport wording) — from the repair case's car or the MoT lookup. */
  vehicle_type: string | null;
  updated_at: string;
} & CaseFileFields;

/** The case-file fields (Amit 14/10, after the BAFI review). */
export type CaseFileFields = {
  claim_number: string | null;
  claim_stage: string | null;
  event_date: string | null;
  customer_phone: string | null;
  claimed_amount: number | null;
  approved_amount: number | null;
  appraiser_name: string | null;
  appraiser_phone: string | null;
  appraiser_email: string | null;
  appraiser_damage: number | null;
  appraiser_fee: number | null;
  depreciation: number | null;
  deductible: number | null;
  salvage_value: number | null;
  extra_expenses: number | null;
  insurer_handler: string | null;
  insurer_handler_phone: string | null;
  insurer_handler_email: string | null;
  tp_plate: string | null;
  tp_insurer: string | null;
  tp_claim_number: string | null;
  tp_owner_name: string | null;
  tp_owner_phone: string | null;
  legal_claim_number: string | null;
  appraiser_note: string | null;
  external_ref?: string | null;
  source?: string;
  /** The repair case / referral this claim belongs to (documents + data come from there). */
  case_id?: string | null;
  referral_id?: string | null;
};
const FILE_TEXT = ['claim_number', 'claim_stage', 'customer_phone', 'appraiser_name', 'appraiser_phone', 'appraiser_email', 'insurer_handler', 'insurer_handler_phone', 'insurer_handler_email', 'tp_plate', 'tp_insurer', 'tp_claim_number', 'tp_owner_name', 'tp_owner_phone', 'legal_claim_number'] as const;
const FILE_MONEY = ['claimed_amount', 'approved_amount', 'appraiser_damage', 'appraiser_fee', 'depreciation', 'deductible', 'salvage_value', 'extra_expenses'] as const;

const NUMS = ['amount_due', 'vat_offset', 'reinstatement', 'claim_check_amount', 'received_amount', 'offset_amount', 'legal_claim_amount', 'legal_recovered_amount', ...FILE_MONEY] as const;

/** Header 🔍: claims by customer name or plate, same visibility as the claims list. */
export async function searchCollectionCases(raw: string): Promise<{ id: string; plate: string; customer: string | null; stage: string | null; openedAt: string | null; closed: boolean }[]> {
  const ctx = await me();
  const db = serviceClient();
  if (!ctx || !db) return [];
  const q = raw.replace(/[%_,()*\\]/g, ' ').trim().slice(0, 60);
  if (q.length < 2) return [];
  const digits = q.replace(/\D/g, '');
  const isPlate = digits.length >= 3 && digits.length === q.replace(/[\s-]/g, '').length;
  let s = db.from('collection_cases').select('id, plate, customer_name, claim_stage, opened_at, closed_at').limit(20);
  s = isPlate ? s.ilike('plate', `%${digits}%`) : s.ilike('customer_name', `%${q}%`);
  if (!ctx.supervisor) s = s.eq('assigned_to', ctx.user.id);
  const { data } = await s;
  return ((data ?? []) as { id: string; plate: string | null; customer_name: string | null; claim_stage: string | null; opened_at: string | null; closed_at: string | null }[]).map((r) => ({
    id: r.id,
    plate: r.plate || '—',
    customer: r.customer_name,
    stage: r.claim_stage,
    openedAt: r.opened_at,
    closed: !!r.closed_at,
  }));
}

/** All claims this user may see — or just one (`onlyId`, the claim file: 16/10 perf,
 *  it used to load the whole list to show one claim). Same scope rules either way. */
export async function listCollectionCases(onlyId?: string): Promise<{
  cases: CollectionCase[];
  collectors: { id: string; name: string }[];
  terms: Record<string, PaymentRule>;
  isCeo: boolean;
  canEditTerms: boolean;
  myId: string | null;
  error?: string;
}> {
  const ctx = await me();
  const empty = { cases: [], collectors: [], terms: {}, isCeo: false, canEditTerms: false, myId: null };
  if (!ctx) return { ...empty, error: 'אין הרשאה' };
  const db = serviceClient();
  if (!db) return { ...empty, error: 'שרת לא מוגדר' };
  const isCeo = ctx.supervisor;
  let q = db.from('collection_cases').select(CASE_COLS).order('opened_at', { ascending: false }).limit(5000);
  if (!isCeo) q = q.eq('assigned_to', ctx.user.id);
  if (onlyId) q = q.eq('id', onlyId);
  const [casesRes, people, branches, termRows] = await Promise.all([
    q,
    db.from('profiles').select('id, full_name, role, is_active').in('role', ['COLLECTIONS', 'CEO']),
    db.from('branches').select('id, name'),
    db.from('insurer_payment_terms').select('insurer, agreement, mode, offset_months, pay_day, cutoff_day, notes, basis'),
  ]);
  if (casesRes.error) return { ...empty, isCeo, myId: ctx.user.id, error: casesRes.error.message };
  const nameById = new Map(((people.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  const branchById = new Map(((branches.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const cases = ((casesRes.data ?? []) as unknown as Record<string, unknown>[]).map((c) => {
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
    canEditTerms: SUPERVISORS.has(ctx.role),
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
  input: CaseInput & {
    finance_closure_id: string | null;
    assign_to?: string | null;
    /** The repair case chosen for this accident (data + scanned documents). */
    case_id?: string | null;
    event_date?: string | null;
    claim_number?: string | null;
    customer_phone?: string | null;
    appraiser_name?: string | null;
    /** Opened straight into legal handling (the "⚖️ טיפול משפטי" screen). */
    legal?: { reason: string; lawyer: string | null; sent_on: string | null; claim_amount: number | null } | null;
  },
): Promise<{ error?: string; ok?: true; id?: string }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  const db = serviceClient();
  if (!db) return { error: 'שרת לא מוגדר' };
  const plate = (input.plate ?? '').replace(/\D/g, '');
  if (plate.length < 5) return { error: 'מספר רכב לא תקין' };
  if (!['DIRECT', 'SHIR', 'IDF'].includes(input.work_source)) return { error: 'מקור עבודה לא תקין' };
  if (![input.case_closed_on, input.claim_check_due_date, input.event_date].every(isDate)) return { error: 'תאריך לא תקין' };
  // The same car can have several accidents; the same accident only one case (Amit, 14/10).
  if (input.event_date) {
    const { data: same } = await db.from('collection_cases').select('id').eq('plate', plate).eq('event_date', input.event_date).is('closed_at', null).limit(1);
    if ((same ?? []).length) return { error: 'כבר יש תיק תביעה פתוח לרכב הזה עם אותו תאריך תאונה — פותחים את התיק הקיים' };
  }
  if (![input.amount_due, input.vat_offset, input.reinstatement, input.claim_check_amount].every(okMoney)) return { error: 'סכום לא תקין' };
  const legal = input.legal ?? null;
  if (legal) {
    if (!txt(legal.reason, 200)) return { error: 'נא לבחור סיבה לטיפול המשפטי' };
    if (!isDate(legal.sent_on) || !okMoney(legal.claim_amount)) return { error: 'פרטי הטיפול המשפטי לא תקינים' };
  }

  let assignee = ctx.user.id;
  if (ctx.supervisor && input.assign_to) {
    const { data: who } = await db.from('profiles').select('id, role, is_active').eq('id', input.assign_to).maybeSingle();
    const w = who as { role: string; is_active: boolean } | null;
    if (!w || w.role !== 'COLLECTIONS' || !w.is_active) return { error: 'מסלקת לא תקינה' };
    assignee = input.assign_to;
  }

  let repairCaseId: string | null = null;
  let referralId: string | null = null;
  let repairBranch: string | null = null;
  if (input.case_id) {
    const { data: rc } = await db.from('cases').select('id, branch_id').eq('id', input.case_id).is('deleted_at', null).maybeSingle();
    if (!rc) return { error: 'תיק התיקון לא נמצא' };
    repairCaseId = (rc as { id: string }).id;
    repairBranch = (rc as { branch_id: string }).branch_id;
    const { data: rf } = await db.from('referrals').select('id').eq('case_id', repairCaseId).limit(1);
    referralId = ((rf ?? []) as { id: string }[])[0]?.id ?? null;
  }
  let branchId: string | null = repairBranch;
  // Car type for the header: the repair case's car, else the Ministry of Transport.
  let vehicleType: string | null = null;
  if (repairCaseId) {
    const { data: car } = await db.from('cases').select('cars(vehicle_type)').eq('id', repairCaseId).maybeSingle();
    const cr = (car as { cars: { vehicle_type: string | null } | { vehicle_type: string | null }[] | null } | null)?.cars;
    vehicleType = (Array.isArray(cr) ? cr[0] : cr)?.vehicle_type ?? null;
  }
  if (!vehicleType) vehicleType = (await lookupVehicle(plate).catch(() => null))?.vehicle_type ?? null;
  // Appraiser + deductible come with the closure data, so the case file starts filled.
  let fromClosure: { appraiser_name: string | null; deductible: number | null; appraiser_fee: number | null } = { appraiser_name: null, deductible: null, appraiser_fee: null };
  if (input.finance_closure_id) {
    const { data: fin } = await db.from('finance_closures').select('id, branch_id, appraiser, deductible, appraiser_fee').eq('id', input.finance_closure_id).maybeSingle();
    if (!fin) return { error: 'הנתונים לא נמצאו' };
    const f = fin as { branch_id: string; appraiser: string | null; deductible: string | number | null; appraiser_fee: string | number | null };
    branchId = f.branch_id;
    fromClosure = { appraiser_name: f.appraiser, deductible: f.deductible == null ? null : Number(f.deductible), appraiser_fee: f.appraiser_fee == null ? null : Number(f.appraiser_fee) };
    const { data: existing } = await db.from('collection_cases').select('id').eq('finance_closure_id', input.finance_closure_id).maybeSingle();
    if (existing) return { error: 'לתיק הזה כבר נפתח תיק תביעה' };
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
      ...fromClosure,
      ...(input.appraiser_name && !fromClosure.appraiser_name ? { appraiser_name: txt(input.appraiser_name, 120) } : {}),
      case_id: repairCaseId,
      referral_id: referralId,
      event_date: input.event_date || null,
      claim_number: txt(input.claim_number, 60),
      customer_phone: txt(input.customer_phone, 30),
      vehicle_type: vehicleType,
      ...(legal
        ? {
            status: 'LEGAL',
            claim_stage: LEGAL_STAGE,
            legal_reason: txt(legal.reason, 200),
            legal_lawyer: txt(legal.lawyer, 80),
            legal_sent_on: legal.sent_on || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }),
            legal_claim_amount: legal.claim_amount,
          }
        : {}),
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
    } as never)
    .select('id')
    .single();
  if (error) return { error: error.message.includes('uq_collection_cases_finance') ? 'לתיק הזה כבר נפתח תיק תביעה' : error.message };
  const newId = (data as { id: string }).id;
  await db.from('collection_case_events').insert({
    case_id: newId,
    kind: 'SYSTEM',
    body: `${legal ? `⚖️ נפתח כתיק משפטי — ${txt(legal.reason, 200)}` : 'התיק נפתח'}${input.finance_closure_id ? ' (הנתונים נשלפו מהסגירה)' : ''}`,
    created_by: ctx.user.id,
  } as never);
  if (legal) {
    const days = defaultStageDays(LEGAL_STAGE);
    if (days) {
      await db.from('collection_case_events').insert({
        case_id: newId, kind: 'NOTE', body: `🤖 תזכורת אוטומטית — ${LEGAL_STAGE}: ${stageRule(LEGAL_STAGE)?.check ?? ''}`,
        remind_at: israelTimeToIso(israelWorkDateIn(days), 9), remind_user: assignee, auto_stage: LEGAL_STAGE, created_by: ctx.user.id,
      } as never);
    }
  }
  revalidatePath('/collections');
  revalidatePath('/legal');
  return { ok: true, id: (data as { id: string }).id };
}

export type CaseUpdate = Partial<CaseInput> & Partial<Omit<CaseFileFields, 'external_ref' | 'source' | 'case_id' | 'referral_id'>> & {
  /** With a claim_stage change: the automatic reminder in N days (null = none; omitted = the stage's default). Not a column. */
  stage_remind_days?: number | null;
  payment_approved_on?: string | null;
  status?: CollectionStatus;
  received_amount?: number | null;
  received_on?: string | null;
  partial_reason?: string | null;
  offset_amount?: number | null;
  note?: string | null;
  appraiser_note?: string | null;
  legal_sent_on?: string | null;
  legal_lawyer?: string | null;
  legal_claim_amount?: number | null;
  legal_closed_on?: string | null;
  legal_recovered_amount?: number | null;
  legal_reason?: string | null;
};

/** "✅ סגירת תביעה" / "↩️ פתיחה מחדש" — by hand only. */
export async function setCollectionClosed(id: string, close: boolean): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  const db = serviceClient();
  if (!db) return { error: 'שרת לא מוגדר' };
  const { data: row } = await db.from('collection_cases').select('assigned_to, closed_at').eq('id', id).maybeSingle();
  const cur = row as { assigned_to: string; closed_at: string | null } | null;
  if (!cur) return { error: 'לא נמצא' };
  if (!ctx.supervisor && cur.assigned_to !== ctx.user.id) return { error: 'התיק משויך למסלקת אחרת' };
  if (!!cur.closed_at === close) return { ok: true };
  const now = new Date().toISOString();
  const { error } = await db.from('collection_cases').update({ closed_at: close ? now : null, updated_by: ctx.user.id, updated_at: now } as never).eq('id', id);
  if (error) return { error: error.message };
  await db.from('collection_case_events').insert({ case_id: id, kind: 'STATUS', body: close ? '✅ התביעה נסגרה' : '↩️ התביעה נפתחה מחדש', created_by: ctx.user.id } as never);
  if (close) await closeAutoReminders(db, id);
  revalidatePath('/collections');
  revalidatePath(`/collections/${id}`);
  return { ok: true };
}

export async function updateCollectionCase(id: string, u: CaseUpdate): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  const db = serviceClient();
  if (!db) return { error: 'שרת לא מוגדר' };
  const { data: row } = await db.from('collection_cases').select('id, assigned_to, closed_at').eq('id', id).maybeSingle();
  const cur = row as { assigned_to: string; closed_at: string | null } | null;
  if (!cur) return { error: 'לא נמצא' };
  if (!ctx.supervisor && cur.assigned_to !== ctx.user.id) return { error: 'התיק משויך למסלקת אחרת' };

  const status = u.status ?? undefined;
  if (status && !STATUSES.has(status)) return { error: 'סטטוס לא תקין' };
  const dates = [u.case_closed_on, u.claim_check_due_date, u.payment_approved_on, u.received_on, u.legal_sent_on, u.legal_closed_on, u.event_date];
  if (!dates.every(isDate)) return { error: 'תאריך לא תקין' };
  const money = [u.amount_due, u.vat_offset, u.reinstatement, u.claim_check_amount, u.received_amount, u.offset_amount, u.legal_claim_amount, u.legal_recovered_amount, ...FILE_MONEY.map((k) => u[k])];
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
  set('appraiser_note', txt(u.appraiser_note, 500));
  set('legal_lawyer', txt(u.legal_lawyer, 80));
  set('legal_reason', txt(u.legal_reason, 200));
  for (const k of FILE_TEXT) set(k, txt(u[k], 120));
  for (const k of FILE_MONEY) set(k, u[k] ?? null);
  set('event_date', u.event_date || null);
  // A status never closes the claim (Galit, 15/10: "נסגרה מעצמה רק כי עדכנתי
  // שהלקוח שילם") — closing is the explicit "✅ סגירת תביעה" (setCollectionClosed).
  if (status) patch.status = status;

  const { data: before } = status || 'claim_stage' in u ? await db.from('collection_cases').select('status, claim_stage').eq('id', id).maybeSingle() : { data: null };
  const { error } = await db.from('collection_cases').update(patch as never).eq('id', id);
  if (error) return { error: error.message };
  const prevStage = (before as { claim_stage: string | null } | null)?.claim_stage ?? null;
  const newStage = 'claim_stage' in u ? txt(u.claim_stage, 120) : prevStage;
  const closedNow = 'closed_at' in patch && !!patch.closed_at;
  if (before && newStage !== prevStage) {
    await db.from('collection_case_events').insert({ case_id: id, kind: 'STATUS', body: `מצב תביעה: ${prevStage ?? '—'} ← ${newStage ?? '—'}`, created_by: ctx.user.id } as never);
    // Automatic stage reminder (Amit, 14/10): the old one is closed, a new one
    // goes to the case's collector — e.g. "ממתין לדוח שמאי" → check in 7 days.
    await closeAutoReminders(db, id);
    const days = 'stage_remind_days' in u ? u.stage_remind_days ?? null : defaultStageDays(newStage);
    if (newStage && days && days > 0 && days <= 120 && !closedNow && !cur.closed_at) {
      const check = stageRule(newStage)?.check || 'לבדוק מה המצב';
      const dateIso = israelWorkDateIn(days);
      await db.from('collection_case_events').insert({
        case_id: id,
        kind: 'NOTE',
        body: `🤖 תזכורת אוטומטית — ${newStage}: ${check}`,
        remind_at: israelTimeToIso(dateIso, 9),
        remind_user: cur.assigned_to,
        auto_stage: newStage,
        created_by: ctx.user.id,
      } as never);
    }
  }
  if (closedNow) await closeAutoReminders(db, id);
  const prev = (before as { status: CollectionStatus } | null)?.status;
  if (status && prev && prev !== status) {
    await db.from('collection_case_events').insert({ case_id: id, kind: 'STATUS', body: `סטטוס: ${STATUS_HE[prev]} ← ${STATUS_HE[status]}`, created_by: ctx.user.id } as never);
  }
  revalidatePath('/collections');
  revalidatePath('/legal');
  revalidatePath(`/collections/${id}`);
  return { ok: true };
}

/** Close a case's open automatic stage reminders (a new stage, or the case closed). */
async function closeAutoReminders(db: NonNullable<ReturnType<typeof serviceClient>>, caseId: string) {
  await db
    .from('collection_case_events')
    .update({ remind_done_at: new Date().toISOString() } as never)
    .eq('case_id', caseId)
    .not('auto_stage', 'is', null)
    .is('remind_done_at', null);
}

const STATUS_HE: Record<CollectionStatus, string> = { OPEN: 'בטיפול', PAID: 'שולם', PARTIAL: 'תשלום חלקי', DISPUTE: 'במחלוקת', LEGAL: 'מחלקה משפטית', BLOCKED: 'חסומה' };

/** Payment agreement per payer (CEO only). rule null removes it. */
export async function saveInsurerTerm(insurer: string, rule: Omit<PaymentRule, 'insurer'> | null): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  // Amit, 14/10: only he and Chani see and edit the payment agreements.
  if (!ctx || !SUPERVISORS.has(ctx.role)) return { error: 'רק עמית וחני מעדכנים הסכמי תשלום' };
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
        basis: rule.basis === 'INVOICE' ? 'INVOICE' : 'APPROVAL',
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

// ---- ש.י.ר monthly batch (Amit, 2026-10-14) ------------------------------
// All ש.י.ר invoices of a month are paid together (שוטף 60, on the 7th of the
// third month), minus offsets, without blocked invoices. The batch lists every
// ש.י.ר closed job by invoice month; marking an offset / block / the month as
// paid opens the collection case when there is none yet (assigned to the user).

export type ShirInvoice = {
  finance_closure_id: string;
  closed_on: string;
  plate: string | null;
  customer_name: string | null;
  invoice_number: string | null;
  branch_name: string | null;
  amount: number; // invoice − VAT offset − reinstatement
  case_id: string | null;
  status: CollectionStatus | null;
  offset_amount: number | null;
  offset_reason: string | null;
  received_on: string | null;
  assigned_name: string | null;
};

export async function listShirBatch(): Promise<{ invoices: ShirInvoice[]; error?: string }> {
  const ctx = await me();
  if (!ctx) return { invoices: [], error: 'אין הרשאה' };
  const db = serviceClient();
  if (!db) return { invoices: [], error: 'שרת לא מוגדר' };
  const [fin, branches] = await Promise.all([
    db
      .from('finance_closures')
      .select('id, closed_on, plate, customer_name, invoice_number, branch_id, amount_ours, vat_offset, reinstatement')
      .eq('work_source', 'SHIR')
      .order('closed_on', { ascending: false })
      .limit(5000),
    db.from('branches').select('id, name'),
  ]);
  if (fin.error) return { invoices: [], error: fin.error.message };
  type F = { id: string; closed_on: string; plate: string | null; customer_name: string | null; invoice_number: string | null; branch_id: string; amount_ours: string | number; vat_offset: string | number | null; reinstatement: string | number | null };
  const rows = (fin.data ?? []) as F[];
  const ids = rows.map((r) => r.id);
  const casesRes = ids.length
    ? await db.from('collection_cases').select('id, finance_closure_id, status, offset_amount, partial_reason, received_on, assigned_to').in('finance_closure_id', ids)
    : { data: [] };
  type C = { id: string; finance_closure_id: string; status: CollectionStatus; offset_amount: string | number | null; partial_reason: string | null; received_on: string | null; assigned_to: string };
  const cases = (casesRes.data ?? []) as C[];
  const owners = Array.from(new Set(cases.map((c) => c.assigned_to)));
  const { data: names } = owners.length ? await db.from('profiles').select('id, full_name').in('id', owners) : { data: [] };
  const nameById = new Map(((names ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  const byFin = new Map(cases.map((c) => [c.finance_closure_id, c]));
  const branchById = new Map(((branches.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  return {
    invoices: rows.map((r) => {
      const c = byFin.get(r.id);
      return {
        finance_closure_id: r.id,
        closed_on: r.closed_on,
        plate: r.plate,
        customer_name: r.customer_name,
        invoice_number: r.invoice_number,
        branch_name: branchById.get(r.branch_id) ?? null,
        amount: Number(r.amount_ours) - Number(r.vat_offset ?? 0) - Number(r.reinstatement ?? 0),
        case_id: c?.id ?? null,
        status: c?.status ?? null,
        offset_amount: c?.offset_amount == null ? null : Number(c.offset_amount),
        offset_reason: c?.partial_reason ?? null,
        received_on: c?.received_on ?? null,
        assigned_name: c ? nameById.get(c.assigned_to) ?? null : null,
      };
    }),
  };
}

type Db = NonNullable<ReturnType<typeof serviceClient>>;

/** The collection case of a finance row — opened (assigned to userId) when missing. */
async function ensureCase(db: Db, financeId: string, userId: string): Promise<{ id: string } | { error: string }> {
  const { data: existing } = await db.from('collection_cases').select('id').eq('finance_closure_id', financeId).maybeSingle();
  if (existing) return { id: (existing as { id: string }).id };
  const { data: f } = await db
    .from('finance_closures')
    .select('id, closed_on, branch_id, plate, customer_name, work_source, insurer, claim_type, invoice_number, amount_ours, vat_offset, reinstatement, claim_check_due_date, claim_check_amount')
    .eq('id', financeId)
    .maybeSingle();
  if (!f) return { error: 'הנתונים לא נמצאו' };
  const r = f as Record<string, unknown>;
  const { data, error } = await db
    .from('collection_cases')
    .insert({
      finance_closure_id: financeId,
      assigned_to: userId,
      branch_id: r.branch_id,
      plate: (r.plate as string | null) ?? '-',
      customer_name: r.customer_name,
      work_source: r.work_source,
      insurer: r.insurer,
      claim_type: r.claim_type,
      case_closed_on: r.closed_on,
      invoice_number: r.invoice_number,
      amount_due: r.amount_ours,
      vat_offset: r.vat_offset,
      reinstatement: r.reinstatement,
      claim_check_due_date: r.claim_check_due_date,
      claim_check_amount: r.claim_check_amount,
      created_by: userId,
      updated_by: userId,
    } as never)
    .select('id')
    .single();
  if (error || !data) return { error: error?.message ?? 'שגיאה בפתיחת תיק' };
  return { id: (data as { id: string }).id };
}

/** Offset (amount + reason) and blocked flag on one ש.י.ר invoice. */
export async function setShirInvoice(
  financeId: string,
  input: { offset_amount: number | null; offset_reason: string | null; blocked: boolean },
): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  if (!okMoney(input.offset_amount)) return { error: 'סכום לא תקין' };
  if (input.offset_amount && !txt(input.offset_reason)) return { error: 'נא לכתוב את סיבת הקיזוז' };
  const db = serviceClient();
  if (!db) return { error: 'שרת לא מוגדר' };
  const c = await ensureCase(db, financeId, ctx.user.id);
  if ('error' in c) return { error: c.error };
  const { data: cur } = await db.from('collection_cases').select('status').eq('id', c.id).maybeSingle();
  const st = (cur as { status: CollectionStatus } | null)?.status ?? 'OPEN';
  const patch: Record<string, unknown> = {
    offset_amount: input.offset_amount,
    partial_reason: txt(input.offset_reason, 500),
    updated_by: ctx.user.id,
    updated_at: new Date().toISOString(),
  };
  if (input.blocked) patch.status = 'BLOCKED';
  else if (st === 'BLOCKED') patch.status = 'OPEN';
  const { error } = await db.from('collection_cases').update(patch as never).eq('id', c.id);
  if (error) return { error: error.message };
  revalidatePath('/collections');
  return { ok: true };
}

/** "החודש שולם": every non-blocked ש.י.ר invoice of the month → paid (net of its offset). */
export async function markShirMonthPaid(ym: string, receivedOn: string): Promise<{ error?: string; ok?: true; paid?: number }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  if (!/^\d{4}-\d{2}$/.test(ym) || !/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) return { error: 'תאריך לא תקין' };
  const db = serviceClient();
  if (!db) return { error: 'שרת לא מוגדר' };
  const [y, m] = ym.split('-').map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const { data: fin } = await db
    .from('finance_closures')
    .select('id, amount_ours, vat_offset, reinstatement')
    .eq('work_source', 'SHIR')
    .gte('closed_on', `${ym}-01`)
    .lte('closed_on', end);
  let paid = 0;
  for (const f of (fin ?? []) as { id: string; amount_ours: string | number; vat_offset: string | number | null; reinstatement: string | number | null }[]) {
    const c = await ensureCase(db, f.id, ctx.user.id);
    if ('error' in c) return { error: c.error };
    const { data: cur } = await db.from('collection_cases').select('status, offset_amount, closed_at').eq('id', c.id).maybeSingle();
    const k = cur as { status: CollectionStatus; offset_amount: string | number | null; closed_at: string | null } | null;
    if (!k || ['BLOCKED', 'PAID', 'PARTIAL', 'LEGAL'].includes(k.status)) continue;
    const offset = Number(k.offset_amount ?? 0);
    const net = Number(f.amount_ours) - Number(f.vat_offset ?? 0) - Number(f.reinstatement ?? 0) - offset;
    const { error } = await db
      .from('collection_cases')
      .update({
        status: offset > 0 ? 'PARTIAL' : 'PAID',
        received_amount: Math.max(0, Math.round(net * 100) / 100),
        received_on: receivedOn,
        closed_at: k.closed_at ?? new Date().toISOString(),
        updated_by: ctx.user.id,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', c.id);
    if (error) return { error: error.message };
    paid++;
  }
  revalidatePath('/collections');
  return { ok: true, paid };
}
