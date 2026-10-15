'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { canUsePartReturns } from '@/lib/partReturns';
import { readInvoice, type InvoiceFields } from '@/lib/invoiceReader';

// Supplier invoices / delivery notes archive (Amit, 2026-10-14) — a tab in
// "החזרות". Table public.supplier_documents (migration 20261014160000). Reads
// go through the user's session (RLS: returns-tracking roles + branch); writes
// and photos through the service client after the checks below.

const BUCKET = 'part-returns';
// PAINTER photographs and sees only their own (RLS); never verifies (Amit, 14/10).
const DOC_ROLES = new Set(['CEO', 'SERVICE_ADVISOR', 'SERVICE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_MANAGER', 'ACCOUNTANT', 'PAINTER']);
const TYPES = new Set(['INVOICE', 'DELIVERY_NOTE', 'CREDIT_INVOICE']);

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
  const { data } = await supabase.from('profiles').select('id, role, branch_ids, is_active, sees_all_branches').eq('id', user.id).maybeSingle();
  const p = data as { id: string; role: string; branch_ids: string[] | null; is_active: boolean; sees_all_branches?: boolean } | null;
  if (!p || p.is_active === false || !DOC_ROLES.has(p.role) || !canUsePartReturns(p.role)) return null;
  return { supabase, user, profile: p };
}

const clean = (v: FormDataEntryValue | null, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export type SupplierDocRow = {
  id: string;
  branch_id: string;
  branch_name: string | null;
  doc_type: 'INVOICE' | 'DELIVERY_NOTE' | 'CREDIT_INVOICE';
  supplier: string;
  doc_number: string | null;
  doc_date: string;
  plate: string | null;
  amount: number | null;
  items: string | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  created_by: string;
  created_by_name: string | null;
  verified_at: string | null;
  verified_by_name: string | null;
  mine: boolean;
};

export async function listSupplierDocs(): Promise<{ rows: SupplierDocRow[]; error?: string }> {
  const ctx = await me();
  if (!ctx) return { rows: [] };
  const { supabase, user } = ctx;
  const { data, error } = await supabase
    .from('supplier_documents')
    .select('id, branch_id, doc_type, supplier, doc_number, doc_date, plate, amount, items, notes, photo_path, created_at, created_by, verified_at, verified_by')
    .order('doc_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) return { rows: [], error: error.message };
  type Raw = Omit<SupplierDocRow, 'branch_name' | 'photo_url' | 'created_by_name' | 'verified_by_name' | 'mine' | 'amount'> & {
    photo_path: string; verified_by: string | null; amount: string | number | null;
  };
  const raw = (data ?? []) as Raw[];
  const db = serviceClient();
  const people = Array.from(new Set(raw.flatMap((r) => [r.created_by, r.verified_by]).filter((x): x is string => !!x)));
  const [names, branches, signed] = await Promise.all([
    people.length && db ? db.from('profiles').select('id, full_name').in('id', people) : Promise.resolve({ data: [] }),
    supabase.from('branches').select('id, name'),
    raw.length && db ? db.storage.from(BUCKET).createSignedUrls(raw.map((r) => r.photo_path), 60 * 60) : Promise.resolve({ data: [] }),
  ]);
  const nameById = new Map(((names.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  const branchById = new Map(((branches.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const urlByPath = new Map(((signed.data ?? []) as { path: string | null; signedUrl: string }[]).map((s) => [s.path, s.signedUrl]));
  return {
    rows: raw.map((r) => ({
      id: r.id,
      branch_id: r.branch_id,
      branch_name: branchById.get(r.branch_id) ?? null,
      doc_type: r.doc_type,
      supplier: r.supplier,
      doc_number: r.doc_number,
      doc_date: r.doc_date,
      plate: r.plate,
      amount: r.amount == null ? null : Number(r.amount),
      items: r.items ?? null,
      notes: r.notes,
      photo_url: urlByPath.get(r.photo_path) ?? null,
      created_at: r.created_at,
      created_by: r.created_by,
      created_by_name: nameById.get(r.created_by) ?? null,
      verified_at: r.verified_at,
      verified_by_name: r.verified_by ? nameById.get(r.verified_by) ?? null : null,
      mine: r.created_by === user.id,
    })),
  };
}

export type SupplierDocDuplicate = { doc_date: string; doc_type: string; supplier: string; doc_number: string; branch_name: string | null };

/** Photograph an invoice / delivery note into the archive. */
export async function createSupplierDoc(formData: FormData): Promise<{ error?: string; ok?: true; duplicates?: SupplierDocDuplicate[] }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  const { supabase, user, profile } = ctx;

  const docType = clean(formData.get('doc_type'), 20);
  if (!TYPES.has(docType)) return { error: 'נא לבחור סוג מסמך' };
  const supplier = clean(formData.get('supplier'), 80);
  if (!supplier) return { error: 'נא לבחור ספק' };
  const docDate = clean(formData.get('doc_date'), 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) return { error: 'תאריך לא תקין' };
  const branchId = clean(formData.get('branch_id'), 40);
  const { data: branchRow } = await supabase.from('branches').select('id').eq('id', branchId).maybeSingle();
  const allBranches = profile.role === 'CEO' || profile.sees_all_branches;
  if (!branchRow || (!allBranches && !(profile.branch_ids ?? []).includes(branchId))) return { error: 'סניף לא תקין' };
  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0 || !file.type.startsWith('image/')) return { error: 'נא לצלם את המסמך' };
  if (file.size > 15 * 1024 * 1024) return { error: 'התמונה גדולה מדי' };
  const amountRaw = clean(formData.get('amount'), 20).replace(/[,₪\s]/g, '');
  const amount = amountRaw ? Number(amountRaw) : null;
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) return { error: 'סכום לא תקין' };
  // Everything is required except the plate (Amit 15/10, #31) — the same check
  // as the form, so a half-read photo can't be saved with empty fields.
  const items = clean(formData.get('items'), 300);
  const missing = [
    !clean(formData.get('doc_number'), 80) && 'מספר מסמך',
    amount == null && 'סכום',
    !items && 'תיאור פריטים',
  ].filter(Boolean);
  if (missing.length) return { error: `יש להשלים: ${missing.join(', ')}` };

  const db = serviceClient();
  if (!db) return { error: 'שרת לא מוגדר' };

  // Double-entry guard (Amit, 2026-10-14): same supplier + same document number
  // already in the archive → ask before saving a second copy.
  const docNumber = clean(formData.get('doc_number'), 80);
  const confirmDuplicate = clean(formData.get('confirm_duplicate'), 5) === 'yes';
  if (docNumber && !confirmDuplicate) {
    const { data: dups } = await db
      .from('supplier_documents')
      .select('doc_date, doc_type, supplier, doc_number, branch_id, branches(name)')
      .eq('supplier', supplier)
      .ilike('doc_number', docNumber.replace(/[%_\\]/g, ''))
      .limit(5);
    const list = (dups ?? []) as { doc_date: string; doc_type: string; supplier: string; doc_number: string; branches: { name: string } | { name: string }[] | null }[];
    if (list.length) {
      return {
        duplicates: list.map((d) => ({
          doc_date: d.doc_date,
          doc_type: d.doc_type,
          supplier: d.supplier,
          doc_number: d.doc_number,
          branch_name: (Array.isArray(d.branches) ? d.branches[0] : d.branches)?.name ?? null,
        })),
      };
    }
  }

  const path = `docs/${branchId}/${docDate}/${crypto.randomUUID()}.${file.type === 'image/png' ? 'png' : 'jpg'}`;
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: `שמירת התמונה נכשלה: ${upErr.message}` };
  const { error } = await db.from('supplier_documents').insert({
    branch_id: branchId,
    doc_type: docType,
    supplier,
    doc_number: docNumber || null,
    duplicate_confirmed_at: confirmDuplicate ? new Date().toISOString() : null,
    doc_date: docDate,
    plate: clean(formData.get('plate'), 12).replace(/\D/g, '') || null,
    amount,
    items,
    notes: clean(formData.get('notes'), 500) || null,
    photo_path: path,
    created_by: user.id,
  } as never);
  if (error) {
    await db.storage.from(BUCKET).remove([path]);
    return { error: error.message };
  }
  revalidatePath('/returns');
  return { ok: true };
}

/** Double check: someone other than the photographer confirms the document. */
export async function verifySupplierDoc(id: string): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  const { supabase, user, profile } = ctx;
  if (profile.role === 'PAINTER') return { error: 'אין הרשאה' };
  const { data } = await supabase.from('supplier_documents').select('id, created_by, verified_at').eq('id', id).maybeSingle();
  const row = data as { id: string; created_by: string; verified_at: string | null } | null;
  if (!row) return { error: 'לא נמצא' };
  if (row.created_by === user.id) return { error: 'הבדיקה צריכה להיעשות על ידי עובד אחר' };
  if (row.verified_at) return { ok: true };
  const db = serviceClient();
  if (!db) return { error: 'שרת לא מוגדר' };
  const { error } = await db
    .from('supplier_documents')
    .update({ verified_by: user.id, verified_at: new Date().toISOString() } as never)
    .eq('id', id)
    .is('verified_at', null);
  if (error) return { error: error.message };
  revalidatePath('/returns');
  return { ok: true };
}

/** Read a photographed invoice / delivery note / credit invoice with Claude
 *  (Amit, 2026-10-14). { unavailable } = no API key or API error — the form
 *  simply stays manual. */
export async function readSupplierDocPhoto(formData: FormData): Promise<{ fields?: InvoiceFields; unavailable?: true; error?: string }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  const photo = formData.get('photo');
  if (!(photo instanceof File) || photo.size === 0 || !photo.type.startsWith('image/')) return { error: 'אין תמונה' };
  if (photo.size > 5 * 1024 * 1024) return { error: 'התמונה גדולה מדי' };
  const base64 = Buffer.from(await photo.arrayBuffer()).toString('base64');
  const mediaType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(photo.type) ? photo.type : 'image/jpeg';
  try {
    const fields = await readInvoice({ base64, mediaType });
    return fields ? { fields } : { unavailable: true };
  } catch (e) {
    console.error('[readSupplierDocPhoto]', e);
    return { unavailable: true };
  }
}
