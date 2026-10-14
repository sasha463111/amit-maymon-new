'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { listCollectionCases, type CollectionCase } from '@/app/actions/collections';
import type { PaymentRule } from '@/lib/collections';

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
  const { data } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
  const p = data as { role: string; is_active: boolean } | null;
  if (!p || p.is_active === false || !ROLES.has(p.role)) return null;
  const db = serviceClient();
  if (!db) return null;
  return { user, role: p.role, db, supervisor: SUPERVISORS.has(p.role) };
}
type Ctx = NonNullable<Awaited<ReturnType<typeof me>>>;

/** The case row if this user may work on it. */
async function caseFor(ctx: Ctx, id: string) {
  const { data } = await ctx.db.from('collection_cases').select('id, assigned_to, finance_closure_id, plate').eq('id', id).maybeSingle();
  const c = data as { id: string; assigned_to: string; finance_closure_id: string | null; plate: string } | null;
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
};
export type CaseFile = { id: string; name: string; label: string | null; url: string | null; mime: string | null; size: number | null; by: string | null; at: string; source: 'CASE' | 'REPAIR' };

export async function getCollectionFile(id: string): Promise<{
  c: CollectionCase | null;
  events: CaseEvent[];
  files: CaseFile[];
  repairCaseId: string | null;
  collectors: { id: string; name: string }[];
  terms: Record<string, PaymentRule>;
  supervisor: boolean;
  error?: string;
}> {
  const empty = { c: null, events: [], files: [], repairCaseId: null, collectors: [], terms: {}, supervisor: false };
  const ctx = await me();
  if (!ctx) return { ...empty, error: 'אין הרשאה' };
  const row = await caseFor(ctx, id);
  if (!row) return { ...empty, error: 'התיק לא נמצא או משויך למסלקת אחרת' };

  // Reuse the list's mapping (numbers, names, branch) — scoped by the same rules.
  const list = await listCollectionCases();
  const c = list.cases.find((x) => x.id === id) ?? null;
  const { db } = ctx;

  const [evRes, fileRes, fin] = await Promise.all([
    db.from('collection_case_events').select('id, kind, body, remind_at, remind_user, reminded_at, remind_done_at, created_by, created_at').eq('case_id', id).order('created_at', { ascending: false }).limit(500),
    db.from('collection_case_files').select('id, file_path, file_name, label, mime_type, file_size, uploaded_by, created_at').eq('case_id', id).order('created_at', { ascending: false }),
    row.finance_closure_id ? db.from('finance_closures').select('case_id').eq('id', row.finance_closure_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  type Ev = { id: string; kind: CaseEventKind; body: string; remind_at: string | null; remind_user: string | null; reminded_at: string | null; remind_done_at: string | null; created_by: string | null; created_at: string };
  type Fl = { id: string; file_path: string; file_name: string | null; label: string | null; mime_type: string | null; file_size: number | null; uploaded_by: string | null; created_at: string };
  const evs = (evRes.data ?? []) as Ev[];
  const fls = (fileRes.data ?? []) as Fl[];
  const repairCaseId = (fin.data as { case_id: string | null } | null)?.case_id ?? null;

  // The repair case's documents (appraiser report, invoice, licences…) — shown, not copied.
  type Rd = { id: string; file_path: string; file_name: string | null; mime_type: string | null; file_size: number | null; uploaded_by: string | null; created_at: string; document_type: string | null };
  const repairDocs = repairCaseId
    ? (((await db.from('case_documents').select('id, file_path, file_name, mime_type, file_size, uploaded_by, created_at, document_type').eq('case_id', repairCaseId).order('created_at', { ascending: false })).data ?? []) as Rd[])
    : [];

  const people = Array.from(new Set([...evs.flatMap((e) => [e.created_by, e.remind_user]), ...fls.map((f) => f.uploaded_by), ...repairDocs.map((d) => d.uploaded_by)].filter((x): x is string => !!x)));
  const [names, ownSigned, repairSigned] = await Promise.all([
    people.length ? db.from('profiles').select('id, full_name').in('id', people) : Promise.resolve({ data: [] }),
    fls.length ? db.storage.from(BUCKET).createSignedUrls(fls.map((f) => f.file_path), 3600) : Promise.resolve({ data: [] }),
    repairDocs.length ? db.storage.from('case-documents').createSignedUrls(repairDocs.map((d) => d.file_path), 3600) : Promise.resolve({ data: [] }),
  ]);
  const nameById = new Map(((names.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  const urls = (s: { data: unknown }) => new Map(((s.data ?? []) as { path: string | null; signedUrl: string }[]).map((x) => [x.path, x.signedUrl]));
  const ownUrl = urls(ownSigned);
  const repUrl = urls(repairSigned);

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
    })),
    files: [
      ...fls.map((f) => ({ id: f.id, name: f.file_name ?? 'מסמך', label: f.label, url: ownUrl.get(f.file_path) ?? null, mime: f.mime_type, size: f.file_size, by: f.uploaded_by ? nameById.get(f.uploaded_by) ?? null : null, at: f.created_at, source: 'CASE' as const })),
      ...repairDocs.map((d) => ({ id: d.id, name: d.file_name ?? 'מסמך', label: d.document_type, url: repUrl.get(d.file_path) ?? null, mime: d.mime_type, size: d.file_size, by: d.uploaded_by ? nameById.get(d.uploaded_by) ?? null : null, at: d.created_at, source: 'REPAIR' as const })),
    ],
    repairCaseId,
    collectors: list.collectors,
    terms: list.terms,
    supervisor: ctx.supervisor,
  };
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
