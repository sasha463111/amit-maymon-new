'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { PART_RETURN_REASONS, PART_RETURN_SUPPLIERS, canUsePartReturns } from '@/lib/partReturns';
import { readSticker, type StickerFields } from '@/lib/stickerReader';

// Parts returns & credits (Amit's spec, 2026-10-12) — replaces, in parallel
// at first, his Google Forms/Sheets. Table public.part_returns (migration
// 20261012090100). Flow: WAITING_PICKUP → COLLECTED (handed to the
// supplier's driver) → CREDITED, or DISPUTE / CANCELLED.
// Reads and status changes go through the user's session (RLS decides who
// sees what); only the sticker photos use the service client, because the
// bucket is private and has no user policies.

const BUCKET = 'part-returns';
const MARK_ROLES = new Set(['CEO', 'SERVICE_ADVISOR', 'SERVICE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_MANAGER', 'PAINTER']);
const HANDOVER_ROLES = new Set(['CEO', 'SERVICE_ADVISOR', 'SERVICE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_MANAGER']);
const CREDIT_ROLES = new Set(['CEO', 'WAREHOUSE_MANAGER']);

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
  const { data } = await supabase.from('profiles').select('id, full_name, role, branch_ids, is_active').eq('id', user.id).maybeSingle();
  const p = data as { id: string; full_name: string | null; role: string; branch_ids: string[] | null; is_active: boolean } | null;
  if (!p || p.is_active === false) return null;
  return { supabase, user, profile: p };
}

function photoPath(branchId: string, f: File): string {
  return `${branchId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${f.type === 'image/png' ? 'png' : 'jpg'}`;
}

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const clean = (v: FormDataEntryValue | null, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export type PartReturnRow = {
  id: string;
  branch_id: string;
  branch_name: string | null;
  case_id: string | null;
  plate: string | null;
  customer_name: string | null;
  supplier: string;
  supplier_label: string;
  sku: string | null;
  description: string | null;
  quantity: number;
  reason: string;
  reason_label: string;
  document_number: string | null;
  status: string;
  created_at: string;
  created_by_name: string | null;
  collected_at: string | null;
  collected_by_name: string | null;
  driver_name: string | null;
  credit_invoice_number: string | null;
  credit_amount: number | null;
  credited_at: string | null;
  dispute_note: string | null;
  notes: string | null;
  photo_url: string | null;
  /** Photo of the supplier's original invoice / of the credit invoice. */
  invoice_url: string | null;
  credit_invoice_url: string | null;
  sticker_date: string | null;
  mine: boolean;
};

/** Mark a part for return: sticker photo (mandatory) + details. */
export async function createPartReturn(formData: FormData) {
  const ctx = await me();
  if (!ctx) return { error: 'לא מחובר' };
  const { supabase, user, profile } = ctx;
  if (!MARK_ROLES.has(profile.role) || !canUsePartReturns(profile.role)) return { error: 'אין הרשאה לסמן החזרה' };

  const photo = formData.get('photo');
  if (!(photo instanceof File) || photo.size === 0) return { error: 'חובה לצלם את המדבקה' };
  if (!photo.type.startsWith('image/')) return { error: 'הקובץ חייב להיות תמונה' };

  const supplier = clean(formData.get('supplier'), 60);
  const supplierOther = clean(formData.get('supplier_other'), 120);
  if (!PART_RETURN_SUPPLIERS.includes(supplier as (typeof PART_RETURN_SUPPLIERS)[number])) return { error: 'נא לבחור ספק' };
  if (supplier === 'אחר' && !supplierOther) return { error: 'נא לכתוב את שם הספק' };

  const reason = clean(formData.get('reason'), 60);
  const reasonOther = clean(formData.get('reason_other'), 300);
  if (!PART_RETURN_REASONS.includes(reason as (typeof PART_RETURN_REASONS)[number])) return { error: 'נא לבחור סיבת החזרה' };
  if (reason === 'אחר' && !reasonOther) return { error: 'נא לכתוב את סיבת ההחזרה' };

  const quantity = Math.max(1, Math.min(999, parseInt(clean(formData.get('quantity'), 6) || '1', 10) || 1));
  const plate = digits(clean(formData.get('plate'), 20)) || null;
  const sku = clean(formData.get('sku'), 80) || null;
  const description = clean(formData.get('description'), 300) || null;
  if (!sku && !description) return { error: 'נא למלא מק"ט או תיאור החלק' };

  // The car's open case, if there is one (a part can also be returned for a
  // car that never arrived — then it's "כללי", without a case).
  let caseId: string | null = null;
  let caseBranch: string | null = null;
  if (plate) {
    const { data: cases } = await supabase
      .from('cases')
      .select('id, branch_id, cars!inner(license_plate)')
      .eq('cars.license_plate', plate)
      .is('deleted_at', null)
      .order('opened_at', { ascending: false })
      .limit(1);
    const c = ((cases ?? []) as { id: string; branch_id: string }[])[0];
    if (c) {
      caseId = c.id;
      caseBranch = c.branch_id;
    }
  }
  const myBranches = profile.branch_ids ?? [];
  const chosenBranch = clean(formData.get('branch_id'), 40);
  const branchId = caseBranch ?? (chosenBranch || myBranches[0] || null);
  if (!branchId) return { error: 'נא לבחור סניף' };

  const db = serviceClient();
  if (!db) return { error: 'שרת לא מוגדר' };
  const path = photoPath(branchId, photo);
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, photo, { contentType: photo.type, upsert: false });
  if (upErr) return { error: `שמירת התמונה נכשלה: ${upErr.message}` };
  // The supplier's invoice, if it is already at hand (optional here — it can
  // be added later from the part's card).
  const invoice = formData.get('invoice');
  let invoicePath: string | null = null;
  if (invoice instanceof File && invoice.size > 0 && invoice.type.startsWith('image/')) {
    invoicePath = photoPath(branchId, invoice);
    const { error: invErr } = await db.storage.from(BUCKET).upload(invoicePath, invoice, { contentType: invoice.type, upsert: false });
    if (invErr) invoicePath = null;
  }

  const { data: row, error } = await supabase
    .from('part_returns')
    .insert({
      branch_id: branchId,
      case_id: caseId,
      plate,
      supplier,
      supplier_other: supplier === 'אחר' ? supplierOther : null,
      sku,
      description,
      quantity,
      reason,
      reason_other: reason === 'אחר' ? reasonOther : null,
      document_number: clean(formData.get('document_number'), 80) || null,
      sticker_date: /^\d{4}-\d{2}-\d{2}$/.test(clean(formData.get('sticker_date'), 10)) ? clean(formData.get('sticker_date'), 10) : null,
      notes: clean(formData.get('notes'), 500) || null,
      sticker_path: path,
      invoice_path: invoicePath,
      created_by: user.id,
    } as never)
    .select('id')
    .single();
  if (error || !row) {
    await db.storage.from(BUCKET).remove(invoicePath ? [path, invoicePath] : [path]);
    return { error: error?.message ?? 'שמירה נכשלה' };
  }

  // Warehouse staff of that branch are told (only they — see
  // notification_is_relevant). Pushed by the DB dispatcher.
  const { data: warehouse } = await db
    .from('profiles')
    .select('id, branch_ids')
    .eq('role', 'WAREHOUSE')
    .eq('is_active', true);
  const targets = ((warehouse ?? []) as { id: string; branch_ids: string[] | null }[])
    .filter((w) => !w.branch_ids?.length || w.branch_ids.includes(branchId))
    .map((w) => w.id)
    .filter((id) => id !== user.id);
  // Warehouse staff are in the pilot (PART_RETURNS_ROLES) — tell them.
  if (targets.length) {
    const supplierLabel = supplier === 'אחר' ? supplierOther : supplier;
    await supabase.from('notifications').insert(
      targets.map((id) => ({
        user_id: id,
        case_id: caseId,
        type: 'PART_RETURN_NEW',
        title: '📦 חלק חדש להחזרה',
        body: [supplierLabel, description || sku, quantity > 1 ? `כמות ${quantity}` : null, plate ? `רכב ${plate}` : 'כללי']
          .filter(Boolean)
          .join(' · '),
        action_url: '/returns',
        triggered_by: user.id,
        read: false,
      })) as never,
    );
  }

  revalidatePath('/returns');
  if (caseId) revalidatePath(`/cases/${caseId}`);
  return { ok: true, id: (row as { id: string }).id, linkedToCase: !!caseId };
}

/** Everything the signed-in user may see (RLS: painters only their own). */
export async function listPartReturns(opts: { caseId?: string } = {}): Promise<{ rows: PartReturnRow[]; role: string | null; error?: string }> {
  const ctx = await me();
  if (!ctx) return { rows: [], role: null, error: 'לא מחובר' };
  const { supabase, user, profile } = ctx;
  if (!canUsePartReturns(profile.role)) return { rows: [], role: profile.role };

  let q = supabase
    .from('part_returns')
    .select('*')
    .neq('status', 'CANCELLED')
    .order('created_at', { ascending: false })
    .limit(500);
  if (opts.caseId) q = q.eq('case_id', opts.caseId);
  const { data, error } = await q;
  if (error) return { rows: [], role: profile.role, error: error.message };
  type Raw = Record<string, unknown> & {
    id: string; branch_id: string; case_id: string | null; plate: string | null; supplier: string; supplier_other: string | null;
    reason: string; reason_other: string | null; sticker_path: string; created_by: string; collected_by: string | null;
    invoice_path: string | null; credit_invoice_path: string | null;
    credit_amount: string | number | null;
  };
  const raw = (data ?? []) as Raw[];

  const db = serviceClient();
  const personIds = Array.from(new Set(raw.flatMap((r) => [r.created_by, r.collected_by]).filter((x): x is string => !!x)));
  const caseIds = Array.from(new Set(raw.map((r) => r.case_id).filter((x): x is string => !!x)));
  const [names, branches, cases, signed] = await Promise.all([
    personIds.length && db ? db.from('profiles').select('id, full_name').in('id', personIds) : Promise.resolve({ data: [] }),
    supabase.from('branches').select('id, name'),
    caseIds.length ? supabase.from('cases').select('id, customer_name').in('id', caseIds) : Promise.resolve({ data: [] }),
    raw.length && db
      ? db.storage.from(BUCKET).createSignedUrls(
          raw.flatMap((r) => [r.sticker_path, r.invoice_path, r.credit_invoice_path]).filter((x): x is string => !!x),
          60 * 60,
        )
      : Promise.resolve({ data: [] }),
  ]);
  const nameById = new Map(((names.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  const branchById = new Map(((branches.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const customerByCase = new Map(((cases.data ?? []) as { id: string; customer_name: string | null }[]).map((c) => [c.id, c.customer_name]));
  const urlByPath = new Map(((signed.data ?? []) as { path: string | null; signedUrl: string }[]).map((s) => [s.path, s.signedUrl]));

  const rows: PartReturnRow[] = raw.map((r) => ({
    id: r.id,
    branch_id: r.branch_id,
    branch_name: branchById.get(r.branch_id) ?? null,
    case_id: r.case_id,
    plate: r.plate,
    customer_name: r.case_id ? customerByCase.get(r.case_id) ?? null : null,
    supplier: r.supplier,
    supplier_label: r.supplier === 'אחר' ? (r.supplier_other || 'אחר') : r.supplier,
    sku: (r.sku as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    quantity: Number(r.quantity) || 1,
    reason: r.reason,
    reason_label: r.reason === 'אחר' ? (r.reason_other || 'אחר') : r.reason,
    document_number: (r.document_number as string | null) ?? null,
    status: r.status as string,
    created_at: r.created_at as string,
    created_by_name: nameById.get(r.created_by) ?? null,
    collected_at: (r.collected_at as string | null) ?? null,
    collected_by_name: r.collected_by ? nameById.get(r.collected_by) ?? null : null,
    driver_name: (r.driver_name as string | null) ?? null,
    credit_invoice_number: (r.credit_invoice_number as string | null) ?? null,
    credit_amount: r.credit_amount == null ? null : Number(r.credit_amount),
    credited_at: (r.credited_at as string | null) ?? null,
    dispute_note: (r.dispute_note as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    photo_url: urlByPath.get(r.sticker_path) ?? null,
    invoice_url: r.invoice_path ? urlByPath.get(r.invoice_path) ?? null : null,
    credit_invoice_url: r.credit_invoice_path ? urlByPath.get(r.credit_invoice_path) ?? null : null,
    sticker_date: (r.sticker_date as string | null) ?? null,
    mine: r.created_by === user.id,
  }));
  return { rows, role: profile.role };
}

/** Parts handed to a supplier's driver — several at once. */
export async function handOverToDriver(ids: string[], driverName: string) {
  const ctx = await me();
  if (!ctx) return { error: 'לא מחובר' };
  if (!HANDOVER_ROLES.has(ctx.profile.role) || !canUsePartReturns(ctx.profile.role)) return { error: 'אין הרשאה לעדכן מסירה' };
  const driver = driverName.trim().slice(0, 80);
  if (!driver) return { error: 'נא לכתוב את שם הנהג' };
  const list = Array.from(new Set(ids)).slice(0, 200);
  if (!list.length) return { error: 'לא נבחרו חלקים' };

  const { data, error } = await ctx.supabase
    .from('part_returns')
    .update({ status: 'COLLECTED', collected_at: new Date().toISOString(), collected_by: ctx.user.id, driver_name: driver, updated_at: new Date().toISOString() } as never)
    .in('id', list)
    .eq('status', 'WAITING_PICKUP')
    .select('id');
  if (error) return { error: error.message };
  revalidatePath('/returns');
  return { ok: true, updated: (data ?? []).length };
}

/** Credit invoice received (warehouse manager / CEO). */
export async function markCredited(id: string, creditInvoiceNumber: string, amount: number | null) {
  const ctx = await me();
  if (!ctx) return { error: 'לא מחובר' };
  if (!CREDIT_ROLES.has(ctx.profile.role)) return { error: 'רק מנהל המחסן או המנכ"ל מעדכנים זיכוי' };
  const inv = creditInvoiceNumber.trim().slice(0, 80);
  if (!inv) return { error: 'נא לכתוב מספר חשבונית זיכוי' };
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) return { error: 'סכום לא תקין' };
  const { error } = await ctx.supabase
    .from('part_returns')
    .update({ status: 'CREDITED', credit_invoice_number: inv, credit_amount: amount, credited_at: new Date().toISOString(), credited_by: ctx.user.id, updated_at: new Date().toISOString() } as never)
    .eq('id', id)
    .in('status', ['COLLECTED', 'DISPUTE']);
  if (error) return { error: error.message };
  revalidatePath('/returns');
  return { ok: true };
}

/** Credit disputed — rare; Roei or Amit resolve it. */
export async function markDispute(id: string, note: string) {
  const ctx = await me();
  if (!ctx) return { error: 'לא מחובר' };
  if (!CREDIT_ROLES.has(ctx.profile.role)) return { error: 'רק מנהל המחסן או המנכ"ל' };
  const text = note.trim().slice(0, 500);
  if (!text) return { error: 'נא לכתוב מה הבעיה' };
  const { error } = await ctx.supabase
    .from('part_returns')
    .update({ status: 'DISPUTE', dispute_note: text, updated_at: new Date().toISOString() } as never)
    .eq('id', id)
    .in('status', ['COLLECTED', 'DISPUTE']);
  if (error) return { error: error.message };
  revalidatePath('/returns');
  return { ok: true };
}

/** Marked by mistake — only while still waiting for pickup. */
export async function cancelPartReturn(id: string) {
  const ctx = await me();
  if (!ctx) return { error: 'לא מחובר' };
  const { data: rowData } = await ctx.supabase.from('part_returns').select('created_by, status').eq('id', id).maybeSingle();
  const row = rowData as { created_by: string; status: string } | null;
  if (!row) return { error: 'לא נמצא' };
  if (row.status !== 'WAITING_PICKUP') return { error: 'אפשר לבטל רק חלק שעוד לא נאסף' };
  if (row.created_by !== ctx.user.id && !HANDOVER_ROLES.has(ctx.profile.role)) return { error: 'אין הרשאה' };
  const { error } = await ctx.supabase
    .from('part_returns')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() } as never)
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/returns');
  return { ok: true };
}

/** Photo of the supplier's original invoice (and its number), or of the
 *  credit invoice — added whenever the paper arrives (Amit, 2026-10-12). */
export async function attachInvoicePhoto(formData: FormData) {
  const ctx = await me();
  if (!ctx) return { error: 'לא מחובר' };
  const { supabase, user, profile } = ctx;
  if (!canUsePartReturns(profile.role)) return { error: 'אין הרשאה' };
  const id = clean(formData.get('id'), 40);
  const kind = clean(formData.get('kind'), 10) === 'credit' ? 'credit' : 'original';
  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0 || !file.type.startsWith('image/')) return { error: 'נא לצלם את החשבונית' };

  // Visible to me (RLS) — and allowed: the warehouse side, or whoever marked it.
  const { data: rowData } = await supabase.from('part_returns').select('id, branch_id, created_by, invoice_path, credit_invoice_path').eq('id', id).maybeSingle();
  const row = rowData as { id: string; branch_id: string; created_by: string; invoice_path: string | null; credit_invoice_path: string | null } | null;
  if (!row) return { error: 'לא נמצא' };
  const allowed = kind === 'credit' ? CREDIT_ROLES.has(profile.role) : HANDOVER_ROLES.has(profile.role) || row.created_by === user.id;
  if (!allowed) return { error: 'אין הרשאה' };

  const db = serviceClient();
  if (!db) return { error: 'שרת לא מוגדר' };
  const path = photoPath(row.branch_id, file);
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: `שמירת התמונה נכשלה: ${upErr.message}` };

  const number = clean(formData.get('number'), 80);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (kind === 'credit') {
    patch.credit_invoice_path = path;
    if (number) patch.credit_invoice_number = number;
  } else {
    patch.invoice_path = path;
    if (number) patch.document_number = number;
  }
  const { error } = await db.from('part_returns').update(patch as never).eq('id', row.id);
  if (error) {
    await db.storage.from(BUCKET).remove([path]);
    return { error: error.message };
  }
  const old = kind === 'credit' ? row.credit_invoice_path : row.invoice_path;
  if (old) await db.storage.from(BUCKET).remove([old]);
  revalidatePath('/returns');
  return { ok: true };
}

/** Read the sticker photo with Claude and return the fields it found
 *  (Amit, 2026-10-14). null fields = not found; { unavailable } = no API key
 *  or API error — the form just stays manual. */
export async function readPartSticker(formData: FormData): Promise<{ fields?: StickerFields; unavailable?: true; error?: string }> {
  const ctx = await me();
  if (!ctx) return { error: 'לא מחובר' };
  if (!MARK_ROLES.has(ctx.profile.role) || !canUsePartReturns(ctx.profile.role)) return { error: 'אין הרשאה' };
  const photo = formData.get('photo');
  if (!(photo instanceof File) || photo.size === 0 || !photo.type.startsWith('image/')) return { error: 'אין תמונה' };
  if (photo.size > 5 * 1024 * 1024) return { error: 'התמונה גדולה מדי' };
  const base64 = Buffer.from(await photo.arrayBuffer()).toString('base64');
  const mediaType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(photo.type) ? photo.type : 'image/jpeg';
  try {
    const fields = await readSticker({ base64, mediaType });
    return fields ? { fields } : { unavailable: true };
  } catch (e) {
    console.error('[readPartSticker]', e);
    return { unavailable: true };
  }
}
