'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { listCollectionCases, type CollectionCase } from '@/app/actions/collections';
import type { PaymentRule } from '@/lib/collections';
import { lookupVehicleByPlate } from '@/app/actions/vehicleLookup';
import { CLAIM_STAGES } from '@/lib/collectionStages';

const DEFAULT_SHORTCUTS = CLAIM_STAGES.slice(0, 6).map((s) => s.stage);
import { loadWeeklySummary, type WeeklySummary } from '@/lib/collectionsWeekly.server';

// The collection case file (Amit, 2026-10-14, after the collectors' BAFI
// screens): inside one case — the running log ("טיפול שוטף") with reminders
// that reach the phone, documents (its own + the repair case's), and every
// detail. Same access as the cases list: a collector — her own cases; CEO and
// bookkeeper — all. Service client only after that check (tables are
// server-only).

const ROLES = new Set(['COLLECTIONS', 'CEO', 'ACCOUNTANT']);
const SUPERVISORS = new Set(['CEO', 'ACCOUNTANT']);
const BUCKET = 'collection-docs';
const MAX_FILE = 4 * 1024 * 1024;
const OK_MIME = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf|message\/rfc822|application\/vnd\.ms-outlook|application\/octet-stream)$/;

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
  const { data } = await supabase.from('profiles').select('role, is_active, collections_manager').eq('id', user.id).maybeSingle();
  const p = data as { role: string; is_active: boolean; collections_manager: boolean } | null;
  if (!p || p.is_active === false || !ROLES.has(p.role)) return null;
  const db = serviceClient();
  if (!db) return null;
  // + the claims department manager (Galit — Discussion #2)
  return { user, role: p.role, db, supervisor: SUPERVISORS.has(p.role) || (p.role === 'COLLECTIONS' && !!p.collections_manager) };
}
type Ctx = NonNullable<Awaited<ReturnType<typeof me>>>;

/** The case row if this user may work on it. */
async function caseFor(ctx: Ctx, id: string) {
  const { data } = await ctx.db.from('collection_cases').select('id, assigned_to, finance_closure_id, plate, case_id, referral_id').eq('id', id).maybeSingle();
  const c = data as { id: string; assigned_to: string; finance_closure_id: string | null; plate: string; case_id: string | null; referral_id: string | null } | null;
  if (!c) return null;
  if (!ctx.supervisor && c.assigned_to !== ctx.user.id) return null;
  return c;
}

export type CaseEventKind = 'NOTE' | 'CALL' | 'EMAIL' | 'STATUS' | 'DOC' | 'SYSTEM';
export type CaseEvent = {
  id: string;
  kind: CaseEventKind;
  body: string;
  remind_at: string | null;
  remind_user_name: string | null;
  remind_is_mine: boolean;
  reminded_at: string | null;
  remind_done_at: string | null;
  created_by_name: string | null;
  created_at: string;
  can_delete: boolean;
};

// Hand-written lines only (Galit 15/10: "אין אפשרות למחוק עדכון"); automatic
// stage changes ("מצב תביעה: X ← Y", "✅ התביעה נסגרה") stay as the claim's history.
function deletable(e: { kind: string; body: string }) {
  return ['NOTE', 'CALL', 'EMAIL', 'DOC'].includes(e.kind) || (e.kind === 'STATUS' && e.body.startsWith('📝'));
}

export async function deleteCaseEvent(eventId: string): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  const { data } = await ctx.db.from('collection_case_events').select('id, case_id, kind, body, created_by').eq('id', eventId).maybeSingle();
  const ev = data as { case_id: string; kind: string; body: string; created_by: string | null } | null;
  if (!ev || !(await caseFor(ctx, ev.case_id))) return { error: 'לא נמצא' };
  if (!deletable(ev)) return { error: 'שינוי מצב אוטומטי לא נמחק — הוא ההיסטוריה של התביעה' };
  if (!ctx.supervisor && ev.created_by !== ctx.user.id) return { error: 'אפשר למחוק רק עדכון שכתבת' };
  const { error } = await ctx.db.from('collection_case_events').delete().eq('id', eventId);
  if (error) return { error: error.message };
  await ctx.db.from('notifications').update({ read: true } as never).eq('type', 'COLLECTION_REMINDER').eq('action_url', `/collections/${ev.case_id}#r-${eventId}`);
  revalidatePath(`/collections/${ev.case_id}`);
  revalidatePath('/collections');
  return { ok: true };
}
export type CaseFile = { id: string; name: string; label: string | null; url: string | null; mime: string | null; size: number | null; by: string | null; at: string; source: 'CASE' | 'REPAIR' | 'REFERRAL' };

export async function getCollectionFile(id: string): Promise<{
  c: CollectionCase | null;
  events: CaseEvent[];
  files: CaseFile[];
  repairCaseId: string | null;
  collectors: { id: string; name: string }[];
  terms: Record<string, PaymentRule>;
  supervisor: boolean;
  shortcuts: string[];
  error?: string;
}> {
  const empty = { c: null, events: [], files: [], repairCaseId: null, collectors: [], terms: {}, supervisor: false, shortcuts: [] };
  const ctx = await me();
  if (!ctx) return { ...empty, error: 'אין הרשאה' };
  const row = await caseFor(ctx, id);
  if (!row) return { ...empty, error: 'התיק לא נמצא או משויך למסלקת אחרת' };

  // Reuse the list's mapping (numbers, names, branch) — scoped by the same rules.
  const list = await listCollectionCases();
  const c = list.cases.find((x) => x.id === id) ?? null;
  const { db } = ctx;
  // Car type (Amit, 14/10): fetched once from the Ministry of Transport, then kept.
  if (c && !c.vehicle_type) {
    const v = await lookupVehicleByPlate(c.plate).catch(() => null);
    if (v?.vehicle_type) {
      c.vehicle_type = v.vehicle_type;
      await db.from('collection_cases').update({ vehicle_type: v.vehicle_type } as never).eq('id', id);
    }
  }
  const shortcuts = await myShortcuts(ctx);

  const [evRes, fileRes, fin] = await Promise.all([
    db.from('collection_case_events').select('id, kind, body, remind_at, remind_user, reminded_at, remind_done_at, created_by, created_at').eq('case_id', id).order('created_at', { ascending: false }).limit(500),
    db.from('collection_case_files').select('id, file_path, file_name, label, mime_type, file_size, uploaded_by, created_at').eq('case_id', id).order('created_at', { ascending: false }),
    row.finance_closure_id ? db.from('finance_closures').select('case_id').eq('id', row.finance_closure_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  type Ev = { id: string; kind: CaseEventKind; body: string; remind_at: string | null; remind_user: string | null; reminded_at: string | null; remind_done_at: string | null; created_by: string | null; created_at: string };
  type Fl = { id: string; file_path: string; file_name: string | null; label: string | null; mime_type: string | null; file_size: number | null; uploaded_by: string | null; created_at: string };
  const evs = (evRes.data ?? []) as Ev[];
  const fls = (fileRes.data ?? []) as Fl[];
  const repairCaseId = row.case_id ?? (fin.data as { case_id: string | null } | null)?.case_id ?? null;

  // The repair case's documents (appraiser report, invoice, licences…) — shown, not copied.
  type Rd = { id: string; file_path: string; file_name: string | null; mime_type: string | null; file_size: number | null; uploaded_by: string | null; created_at: string; document_type: string | null };
  const repairDocs = repairCaseId
    ? (((await db.from('case_documents').select('id, file_path, file_name, mime_type, file_size, uploaded_by, created_at, document_type').eq('case_id', repairCaseId).order('created_at', { ascending: false })).data ?? []) as Rd[])
    : [];

  // …and the referral's (ID, licences, policy — scanned at intake or sent by the customer).
  type Fd = { id: string; file_path: string; file_name: string | null; mime_type: string | null; file_size: number | null; uploaded_by: string | null; created_at: string; doc_kind: string | null };
  let referralIds: string[] = row.referral_id ? [row.referral_id] : [];
  if (!referralIds.length && repairCaseId) {
    const { data: rfs } = await db.from('referrals').select('id').eq('case_id', repairCaseId);
    referralIds = ((rfs ?? []) as { id: string }[]).map((r) => r.id);
  }
  const referralDocs = referralIds.length
    ? (((await db.from('referral_documents').select('id, file_path, file_name, mime_type, file_size, uploaded_by, created_at, doc_kind').in('referral_id', referralIds).order('created_at', { ascending: false })).data ?? []) as Fd[])
    : [];

  const people = Array.from(new Set([...evs.flatMap((e) => [e.created_by, e.remind_user]), ...fls.map((f) => f.uploaded_by), ...repairDocs.map((d) => d.uploaded_by), ...referralDocs.map((d) => d.uploaded_by)].filter((x): x is string => !!x)));
  const [names, ownSigned, repairSigned, referralSigned] = await Promise.all([
    people.length ? db.from('profiles').select('id, full_name').in('id', people) : Promise.resolve({ data: [] }),
    fls.length ? db.storage.from(BUCKET).createSignedUrls(fls.map((f) => f.file_path), 3600) : Promise.resolve({ data: [] }),
    repairDocs.length ? db.storage.from('case-documents').createSignedUrls(repairDocs.map((d) => d.file_path), 3600) : Promise.resolve({ data: [] }),
    referralDocs.length ? db.storage.from('referral-documents').createSignedUrls(referralDocs.map((d) => d.file_path), 3600) : Promise.resolve({ data: [] }),
  ]);
  const nameById = new Map(((names.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  const urls = (s: { data: unknown }) => new Map(((s.data ?? []) as { path: string | null; signedUrl: string }[]).map((x) => [x.path, x.signedUrl]));
  const ownUrl = urls(ownSigned);
  const repUrl = urls(repairSigned);
  const refUrl = urls(referralSigned);

  return {
    c,
    events: evs.map((e) => ({
      id: e.id,
      kind: e.kind,
      body: e.body,
      remind_at: e.remind_at,
      remind_user_name: e.remind_user ? nameById.get(e.remind_user) ?? null : null,
      remind_is_mine: e.remind_user === ctx.user.id,
      reminded_at: e.reminded_at,
      remind_done_at: e.remind_done_at,
      created_by_name: e.created_by ? nameById.get(e.created_by) ?? null : null,
      created_at: e.created_at,
      can_delete: deletable(e) && (ctx.supervisor || e.created_by === ctx.user.id),
    })),
    files: [
      ...fls.map((f) => ({ id: f.id, name: f.file_name ?? 'מסמך', label: f.label, url: ownUrl.get(f.file_path) ?? null, mime: f.mime_type, size: f.file_size, by: f.uploaded_by ? nameById.get(f.uploaded_by) ?? null : null, at: f.created_at, source: 'CASE' as const })),
      ...repairDocs.map((d) => ({ id: d.id, name: d.file_name ?? 'מסמך', label: d.document_type, url: repUrl.get(d.file_path) ?? null, mime: d.mime_type, size: d.file_size, by: d.uploaded_by ? nameById.get(d.uploaded_by) ?? null : null, at: d.created_at, source: 'REPAIR' as const })),
      ...referralDocs.map((d) => ({ id: d.id, name: d.file_name ?? 'מסמך', label: d.doc_kind, url: refUrl.get(d.file_path) ?? null, mime: d.mime_type, size: d.file_size, by: d.uploaded_by ? nameById.get(d.uploaded_by) ?? null : 'הלקוח (קישור)', at: d.created_at, source: 'REFERRAL' as const })),
    ],
    repairCaseId,
    collectors: list.collectors,
    terms: list.terms,
    supervisor: ctx.supervisor,
    shortcuts,
  };
}

// ---- my stage shortcuts + free-text status updates (Amit, 14/10) -------------

async function myShortcuts(ctx: Ctx): Promise<string[]> {
  const { data } = await ctx.db.from('collection_user_prefs').select('stage_shortcuts').eq('user_id', ctx.user.id).maybeSingle();
  const list = (data as { stage_shortcuts: string[] | null } | null)?.stage_shortcuts;
  return list ?? DEFAULT_SHORTCUTS;
}

/** Each collector edits her own one-tap stage buttons. */
export async function saveStageShortcuts(list: string[]): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  const clean = Array.from(new Set((list ?? []).map((x) => String(x).trim().slice(0, 60)).filter(Boolean))).slice(0, 20);
  const { error } = await ctx.db.from('collection_user_prefs').upsert({ user_id: ctx.user.id, stage_shortcuts: clean, updated_at: new Date().toISOString() } as never, { onConflict: 'user_id' });
  if (error) return { error: error.message };
  revalidatePath('/collections', 'layout');
  return { ok: true };
}

/** "עדכון מצב במלל חופשי" — a status line, stamped with date and time. */
export async function addStatusUpdate(caseId: string, text: string): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  if (!(await caseFor(ctx, caseId))) return { error: 'התיק לא נמצא' };
  const body = (text ?? '').trim().slice(0, 1000);
  if (body.length < 2) return { error: 'נא לכתוב את העדכון' };
  const { error } = await ctx.db.from('collection_case_events').insert({ case_id: caseId, kind: 'STATUS', body: `📝 ${body}`, created_by: ctx.user.id } as never);
  if (error) return { error: error.message };
  await ctx.db.from('collection_cases').update({ updated_at: new Date().toISOString(), updated_by: ctx.user.id } as never).eq('id', caseId);
  revalidatePath(`/collections/${caseId}`);
  return { ok: true };
}

/** A line in "טיפול שוטף", optionally with a reminder (pushed by the cron within ~30 min of its time). */
export async function addCaseEvent(
  caseId: string,
  input: { kind: CaseEventKind; body: string; remind_at?: string | null; remind_for?: 'me' | 'owner' },
): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  const row = await caseFor(ctx, caseId);
  if (!row) return { error: 'התיק לא נמצא' };
  if (!['NOTE', 'CALL', 'EMAIL', 'DOC'].includes(input.kind)) return { error: 'סוג לא תקין' };
  const body = (input.body ?? '').trim().slice(0, 2000);
  if (!body) return { error: 'נא לכתוב מה נעשה / על מה התזכורת' };
  let remindAt: string | null = null;
  if (input.remind_at) {
    const d = new Date(input.remind_at);
    if (Number.isNaN(d.getTime())) return { error: 'מועד תזכורת לא תקין' };
    if (d.getTime() > Date.now() + 400 * 86_400_000) return { error: 'מועד התזכורת רחוק מדי' };
    remindAt = d.toISOString();
  }
  const remindUser = remindAt ? (input.remind_for === 'owner' ? row.assigned_to : ctx.user.id) : null;
  const { error } = await ctx.db.from('collection_case_events').insert({
    case_id: caseId,
    kind: input.kind,
    body,
    remind_at: remindAt,
    remind_user: remindUser,
    created_by: ctx.user.id,
  } as never);
  if (error) return { error: error.message };
  await ctx.db.from('collection_cases').update({ updated_at: new Date().toISOString(), updated_by: ctx.user.id } as never).eq('id', caseId);
  revalidatePath(`/collections/${caseId}`);
  revalidatePath('/collections');
  return { ok: true };
}

/** "✓ בוצע" on a reminder — by the person it is for, or a supervisor. */
export async function finishReminder(eventId: string): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  const { data } = await ctx.db.from('collection_case_events').select('id, case_id, remind_user').eq('id', eventId).maybeSingle();
  const ev = data as { case_id: string; remind_user: string | null } | null;
  if (!ev || !(await caseFor(ctx, ev.case_id))) return { error: 'לא נמצא' };
  if (!ctx.supervisor && ev.remind_user !== ctx.user.id) return { error: 'התזכורת של מישהי אחרת' };
  const { error } = await ctx.db
    .from('collection_case_events')
    .update({ remind_done_at: new Date().toISOString() } as never)
    .eq('id', eventId);
  if (error) return { error: error.message };
  // The bell notification for this reminder is done too.
  await ctx.db.from('notifications').update({ read: true } as never).eq('type', 'COLLECTION_REMINDER').eq('action_url', `/collections/${ev.case_id}#r-${eventId}`);
  revalidatePath(`/collections/${ev.case_id}`);
  revalidatePath('/collections');
  return { ok: true };
}

/** One document per call (the client shrinks photos first). */
export async function uploadCaseFile(fd: FormData): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  const caseId = String(fd.get('case_id') ?? '');
  const row = await caseFor(ctx, caseId);
  if (!row) return { error: 'התיק לא נמצא' };
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'לא נבחר קובץ' };
  if (file.size > MAX_FILE) return { error: 'הקובץ גדול מדי (עד 4MB)' };
  const name = file.name.slice(0, 160);
  const isMail = /\.(eml|msg)$/i.test(name);
  const mime = file.type || (isMail ? 'message/rfc822' : 'application/octet-stream');
  if (!OK_MIME.test(mime) && !isMail) return { error: 'סוג קובץ לא נתמך (תמונה, PDF או מייל)' };
  const label = String(fd.get('label') ?? '').trim().slice(0, 80) || null;
  const ext = (name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? 'bin').toLowerCase();
  const path = `${caseId}/${crypto.randomUUID()}.${ext}`;
  const up = await ctx.db.storage.from(BUCKET).upload(path, file, { contentType: mime, upsert: false });
  if (up.error) return { error: up.error.message };
  const { error } = await ctx.db.from('collection_case_files').insert({
    case_id: caseId, file_path: path, file_name: name, mime_type: mime, file_size: file.size, label, uploaded_by: ctx.user.id,
  } as never);
  if (error) {
    await ctx.db.storage.from(BUCKET).remove([path]);
    return { error: error.message };
  }
  await ctx.db.from('collection_case_events').insert({ case_id: caseId, kind: isMail ? 'EMAIL' : 'DOC', body: `${isMail ? 'צורף מייל' : 'הועלה מסמך'}: ${label ?? name}`, created_by: ctx.user.id } as never);
  revalidatePath(`/collections/${caseId}`);
  return { ok: true };
}

/** Open reminders for me — the strip at the top of /collections. */
export type MyReminder = { id: string; case_id: string; plate: string; customer_name: string | null; body: string; remind_at: string };
export async function listMyReminders(): Promise<MyReminder[]> {
  const ctx = await me();
  if (!ctx) return [];
  const { data } = await ctx.db
    .from('collection_case_events')
    .select('id, case_id, body, remind_at, collection_cases!inner(plate, customer_name)')
    .eq('remind_user', ctx.user.id)
    .is('remind_done_at', null)
    .not('remind_at', 'is', null)
    .order('remind_at')
    .limit(200);
  type R = { id: string; case_id: string; body: string; remind_at: string; collection_cases: { plate: string; customer_name: string | null } | { plate: string; customer_name: string | null }[] };
  return ((data ?? []) as R[]).map((r) => {
    const c = Array.isArray(r.collection_cases) ? r.collection_cases[0] : r.collection_cases;
    return { id: r.id, case_id: r.case_id, plate: c?.plate ?? '', customer_name: c?.customer_name ?? null, body: r.body, remind_at: r.remind_at };
  });
}

/** Everything we already have for a plate — for "פתיחת תיק" (Amit, 14/10): the
 *  same customer can have several accidents, so first show the collection
 *  cases that already exist for this car (same accident → open it), then the
 *  repair cases with their accident dates, to pull the data that was typed. */
export type ExistingCollection = { id: string; event_date: string | null; opened_at: string; claim_number: string | null; claim_stage: string | null; status: string; closed: boolean; assigned_name: string | null; mine: boolean };
export type RepairMatch = {
  case_id: string; case_key: string | null; event_date: string | null; opened_at: string | null; closed: boolean; branch_name: string | null;
  customer_name: string | null; phone: string | null; insurer: string | null; claim_number: string | null; appraiser_name: string | null; sub_claim_type: string | null; docs: number;
};
export async function lookupPlateHistory(plateInput: string): Promise<{ existing: ExistingCollection[]; repairs: RepairMatch[]; error?: string }> {
  const ctx = await me();
  if (!ctx) return { existing: [], repairs: [], error: 'אין הרשאה' };
  const plate = plateInput.replace(/\D/g, '');
  if (plate.length < 5) return { existing: [], repairs: [], error: 'מספר רכב לא תקין' };
  const { db } = ctx;
  const [coll, cars] = await Promise.all([
    db.from('collection_cases').select('id, event_date, opened_at, claim_number, claim_stage, status, closed_at, assigned_to').eq('plate', plate).order('opened_at', { ascending: false }),
    db.from('cars').select('id, license_plate').ilike('license_plate', `%${plate.slice(-5)}%`),
  ]);
  const carIds = ((cars.data ?? []) as { id: string; license_plate: string }[]).filter((c) => c.license_plate.replace(/\D/g, '') === plate).map((c) => c.id);
  type Cs = { id: string; case_key: string | null; event_date: string | null; opened_at: string | null; closed_at: string | null; customer_name: string | null; phone: string | null; insurance_company: string | null; claim_number: string | null; appraiser_name: string | null; sub_claim_type: string | null; branches: { name: string } | { name: string }[] | null };
  const repairs = carIds.length
    ? (((await db.from('cases').select('id, case_key, event_date, opened_at, closed_at, customer_name, phone, insurance_company, claim_number, appraiser_name, sub_claim_type, branches(name)').in('car_id', carIds).is('deleted_at', null).order('opened_at', { ascending: false }).limit(20)).data ?? []) as Cs[])
    : [];
  const docCounts = new Map<string, number>();
  if (repairs.length) {
    const { data: docs } = await db.from('case_documents').select('case_id').in('case_id', repairs.map((r) => r.id));
    for (const d of (docs ?? []) as { case_id: string }[]) docCounts.set(d.case_id, (docCounts.get(d.case_id) ?? 0) + 1);
  }
  const collRows = (coll.data ?? []) as { id: string; event_date: string | null; opened_at: string; claim_number: string | null; claim_stage: string | null; status: string; closed_at: string | null; assigned_to: string }[];
  const owners = Array.from(new Set(collRows.map((c) => c.assigned_to)));
  const { data: names } = owners.length ? await db.from('profiles').select('id, full_name').in('id', owners) : { data: [] };
  const nameById = new Map(((names ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  return {
    existing: collRows.map((c) => ({
      id: c.id, event_date: c.event_date, opened_at: c.opened_at, claim_number: c.claim_number, claim_stage: c.claim_stage, status: c.status,
      closed: !!c.closed_at, assigned_name: nameById.get(c.assigned_to) ?? null, mine: c.assigned_to === ctx.user.id || ctx.supervisor,
    })),
    repairs: repairs.map((r) => ({
      case_id: r.id, case_key: r.case_key, event_date: r.event_date, opened_at: r.opened_at, closed: !!r.closed_at,
      branch_name: (Array.isArray(r.branches) ? r.branches[0] : r.branches)?.name ?? null,
      customer_name: r.customer_name, phone: r.phone, insurer: r.insurance_company, claim_number: r.claim_number, appraiser_name: r.appraiser_name,
      sub_claim_type: r.sub_claim_type, docs: docCounts.get(r.id) ?? 0,
    })),
  };
}

/** Move a case to another collector (CEO / bookkeeper). */
export async function reassignCase(caseId: string, collectorId: string): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx || !ctx.supervisor) return { error: 'אין הרשאה' };
  const { data: who } = await ctx.db.from('profiles').select('id, role, is_active, full_name').eq('id', collectorId).maybeSingle();
  const w = who as { role: string; is_active: boolean; full_name: string | null } | null;
  if (!w || w.role !== 'COLLECTIONS' || !w.is_active) return { error: 'מסלקת לא תקינה' };
  const { error } = await ctx.db.from('collection_cases').update({ assigned_to: collectorId, updated_by: ctx.user.id, updated_at: new Date().toISOString() } as never).eq('id', caseId);
  if (error) return { error: error.message };
  await ctx.db.from('collection_case_events').insert({ case_id: caseId, kind: 'SYSTEM', body: `התיק הועבר ל${w.full_name ?? 'מסלקת'}`, created_by: ctx.user.id } as never);
  revalidatePath(`/collections/${caseId}`);
  revalidatePath('/collections');
  return { ok: true };
}

// ---- beta feedback (Amit, 14/10: "שירשמו לי כל חלום שלהם") --------------------

export type FeedbackKind = 'IDEA' | 'PROBLEM' | 'DREAM';
export type Feedback = { id: string; kind: FeedbackKind; body: string; page: string | null; status: string; reply: string | null; by: string | null; at: string; mine: boolean };
const FEEDBACK_HE: Record<FeedbackKind, string> = { IDEA: '💡 רעיון לשיפור', PROBLEM: '⚠️ משהו לא עובד', DREAM: '✨ חלום' };

export async function sendBetaFeedback(kind: FeedbackKind, body: string, page: string | null): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  if (!(kind in FEEDBACK_HE)) return { error: 'סוג לא תקין' };
  const text = (body ?? '').trim().slice(0, 3000);
  if (text.length < 3) return { error: 'נא לכתוב כמה מילים' };
  const { error } = await ctx.db.from('beta_feedback').insert({ kind, body: text, page: (page ?? '').slice(0, 200) || null, created_by: ctx.user.id } as never);
  if (error) return { error: error.message };
  // Also onto the bugs / features boards (Tomer, 15/10): a problem → 🐞, an
  // idea or a dream → 🚀. Tomer / Amit can re-tag it there.
  const boardKind = kind === 'PROBLEM' ? 'BUG' : 'FEATURE';
  const { data: reqRow } = await ctx.db
    .from('app_requests')
    .insert({ body: text.replace(/\s+/g, ' ').slice(0, 200), kind: boardKind, created_by: ctx.user.id } as never)
    .select('id')
    .single();
  const reqId = (reqRow as { id: string } | null)?.id;
  if (reqId) {
    await ctx.db.from('app_request_messages').insert({
      request_id: reqId,
      body: `${text}

(${FEEDBACK_HE[kind]} מכפתור המשוב בתביעות ביטוח${page ? ` · ${page.slice(0, 200)}` : ''})`,
      author_id: ctx.user.id,
    } as never);
  }
  // To Amit as a personal note (push + "הודעות"), one row — DIRECT_NOTE is never fanned out.
  const [{ data: sender }, { data: ceo }] = await Promise.all([
    ctx.db.from('profiles').select('full_name').eq('id', ctx.user.id).maybeSingle(),
    ctx.db.from('profiles').select('id').eq('role', 'CEO').eq('is_active', true).limit(1),
  ]);
  const ceoId = ((ceo ?? []) as { id: string }[])[0]?.id;
  if (ceoId && ceoId !== ctx.user.id) {
    await ctx.db.from('notifications').insert({
      user_id: ceoId,
      type: 'DIRECT_NOTE',
      triggered_by: ctx.user.id,
      title: `${FEEDBACK_HE[kind]} — תביעות ביטוח (${(sender as { full_name: string | null } | null)?.full_name ?? ''})`,
      body: text.slice(0, 300),
      action_url: reqId ? `${boardKind === 'BUG' ? '/bugs' : '/features'}#${reqId}` : '/collections?tab=feedback',
    } as never);
  }
  revalidatePath('/collections');
  return { ok: true };
}

export async function listBetaFeedback(): Promise<Feedback[]> {
  const ctx = await me();
  if (!ctx) return [];
  let q = ctx.db.from('beta_feedback').select('id, kind, body, page, status, reply, created_by, created_at').eq('area', 'collections').order('created_at', { ascending: false }).limit(300);
  if (!ctx.supervisor) q = q.eq('created_by', ctx.user.id);
  const rows = ((await q).data ?? []) as { id: string; kind: FeedbackKind; body: string; page: string | null; status: string; reply: string | null; created_by: string | null; created_at: string }[];
  const ids = Array.from(new Set(rows.map((r) => r.created_by).filter((x): x is string => !!x)));
  const { data: names } = ids.length ? await ctx.db.from('profiles').select('id, full_name').in('id', ids) : { data: [] };
  const nameById = new Map(((names ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  return rows.map((r) => ({ id: r.id, kind: r.kind, body: r.body, page: r.page, status: r.status, reply: r.reply, by: r.created_by ? nameById.get(r.created_by) ?? null : null, at: r.created_at, mine: r.created_by === ctx.user.id }));
}

export async function answerFeedback(id: string, status: 'NEW' | 'PLANNED' | 'DONE' | 'NO', reply: string | null): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx || !ctx.supervisor) return { error: 'אין הרשאה' };
  if (!['NEW', 'PLANNED', 'DONE', 'NO'].includes(status)) return { error: 'סטטוס לא תקין' };
  const { error } = await ctx.db.from('beta_feedback').update({ status, reply: (reply ?? '').trim().slice(0, 1000) || null } as never).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/collections');
  return { ok: true };
}

/** The weekly summary, live — the "📊 סיכום שבועי" tab (CEO / bookkeeper). */
export async function getWeeklySummary(): Promise<WeeklySummary | null> {
  const ctx = await me();
  if (!ctx || !ctx.supervisor) return null;
  return loadWeeklySummary(ctx.db);
}
