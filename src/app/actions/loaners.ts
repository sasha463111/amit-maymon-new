'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { AGREEMENT_VERSION, canUseLoaners, type DriverDetails } from '@/lib/loaners';

// Replacement cars (Amit, 2026-10-14) — office + CEO. Tables are server-only
// (RLS on, no grants); everything goes through here after the role check.
// Files: private bucket loaner-docs, shown through short-lived signed URLs.

const BUCKET = 'loaner-docs';

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
  const { data } = await supabase.from('profiles').select('role, is_active, branch_ids').eq('id', user.id).maybeSingle();
  const p = data as { role: string; is_active: boolean; branch_ids: string[] | null } | null;
  if (!p || p.is_active === false || !canUseLoaners(p.role)) return null;
  const db = serviceClient();
  if (!db) return null;
  return { supabase, db, user, role: p.role };
}

const clean = (v: FormDataEntryValue | null, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: FormDataEntryValue | null) => {
  const s = clean(v, 12).replace(/\D/g, '');
  return s ? Number(s) : null;
};
const isoOrNull = (v: FormDataEntryValue | null) => {
  const s = clean(v, 40);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

async function upload(db: NonNullable<ReturnType<typeof serviceClient>>, prefix: string, f: File): Promise<string | null> {
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > 20 * 1024 * 1024) return null;
  if (!/^(image\/|application\/pdf)/.test(f.type)) return null;
  const ext = f.type === 'application/pdf' ? 'pdf' : f.type === 'image/png' ? 'png' : 'jpg';
  const path = `${prefix}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: false });
  return error ? null : path;
}

export type FleetCar = { id: string; plate: string; car_type: string; branch_id: string | null; branch_name: string | null; notes: string | null; active: boolean; busy: boolean };
export type LoanerDoc = { id: string; stage: 'OUT' | 'IN'; url: string | null; file_name: string | null; mime_type: string | null; created_at: string };
export type Handover = {
  id: string;
  fleet_id: string | null;
  loaner_plate: string;
  loaner_type: string | null;
  case_id: string | null;
  branch_name: string | null;
  customer_plate: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  given_at: string;
  returned_at: string | null;
  km_out: number | null;
  km_in: number | null;
  fuel_out: string | null;
  fuel_in: string | null;
  signed_form_url: string | null;
  signature_url: string | null;
  agreement_signed_at: string | null;
  notes: string | null;
  return_notes: string | null;
  driver: Partial<DriverDetails> | null;
  created_by_name: string | null;
  returned_by_name: string | null;
  docs: LoanerDoc[];
};

export async function listLoaners(): Promise<{ fleet: FleetCar[]; handovers: Handover[]; branches: { id: string; name: string }[]; error?: string }> {
  const ctx = await me();
  if (!ctx) return { fleet: [], handovers: [], branches: [], error: 'אין הרשאה' };
  const { db } = ctx;
  const [fleetRes, hoRes, docsRes, branchesRes] = await Promise.all([
    db.from('loaner_fleet').select('id, plate, car_type, branch_id, notes, active').order('plate'),
    db.from('loaner_handovers').select('*').order('given_at', { ascending: false }).limit(3000),
    db.from('loaner_documents').select('id, handover_id, stage, file_path, file_name, mime_type, created_at').order('created_at'),
    db.from('branches').select('id, name').order('name'),
  ]);
  if (hoRes.error) return { fleet: [], handovers: [], branches: [], error: hoRes.error.message };
  const branches = (branchesRes.data ?? []) as { id: string; name: string }[];
  const branchById = new Map(branches.map((b) => [b.id, b.name]));
  type H = Record<string, unknown> & { id: string; fleet_id: string | null; returned_at: string | null; signed_form_path: string | null; signature_path: string | null; created_by: string | null; returned_by: string | null; branch_id: string | null };
  const hos = (hoRes.data ?? []) as H[];
  type D = { id: string; handover_id: string; stage: 'OUT' | 'IN'; file_path: string; file_name: string | null; mime_type: string | null; created_at: string };
  const docs = (docsRes.data ?? []) as D[];
  const paths = [...hos.flatMap((h) => [h.signed_form_path, h.signature_path]), ...docs.map((d) => d.file_path)].filter((p): p is string => !!p);
  const people = Array.from(new Set(hos.flatMap((h) => [h.created_by, h.returned_by]).filter((x): x is string => !!x)));
  const [signed, names] = await Promise.all([
    paths.length ? db.storage.from(BUCKET).createSignedUrls(paths, 60 * 60) : Promise.resolve({ data: [] }),
    people.length ? db.from('profiles').select('id, full_name').in('id', people) : Promise.resolve({ data: [] }),
  ]);
  const urlByPath = new Map(((signed.data ?? []) as { path: string | null; signedUrl: string }[]).map((s) => [s.path, s.signedUrl]));
  const nameById = new Map(((names.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  const busyFleet = new Set(hos.filter((h) => !h.returned_at && h.fleet_id).map((h) => h.fleet_id as string));
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    branches,
    fleet: ((fleetRes.data ?? []) as Omit<FleetCar, 'busy' | 'branch_name'>[]).map((f) => ({ ...f, branch_name: f.branch_id ? branchById.get(f.branch_id) ?? null : null, busy: busyFleet.has(f.id) })),
    handovers: hos.map((h) => ({
      id: h.id,
      fleet_id: h.fleet_id,
      loaner_plate: h.loaner_plate as string,
      loaner_type: (h.loaner_type as string | null) ?? null,
      case_id: (h.case_id as string | null) ?? null,
      branch_name: h.branch_id ? branchById.get(h.branch_id) ?? null : null,
      customer_plate: (h.customer_plate as string | null) ?? null,
      customer_name: (h.customer_name as string | null) ?? null,
      customer_phone: (h.customer_phone as string | null) ?? null,
      given_at: h.given_at as string,
      returned_at: h.returned_at,
      km_out: n(h.km_out),
      km_in: n(h.km_in),
      fuel_out: (h.fuel_out as string | null) ?? null,
      fuel_in: (h.fuel_in as string | null) ?? null,
      signed_form_url: h.signed_form_path ? urlByPath.get(h.signed_form_path) ?? null : null,
      signature_url: h.signature_path ? urlByPath.get(h.signature_path) ?? null : null,
      agreement_signed_at: (h.agreement_signed_at as string | null) ?? null,
      notes: (h.notes as string | null) ?? null,
      return_notes: (h.return_notes as string | null) ?? null,
      driver: (h.driver_details as Partial<DriverDetails> | null) ?? null,
      created_by_name: h.created_by ? nameById.get(h.created_by) ?? null : null,
      returned_by_name: h.returned_by ? nameById.get(h.returned_by) ?? null : null,
      docs: docs
        .filter((d) => d.handover_id === h.id)
        .map((d) => ({ id: d.id, stage: d.stage, url: urlByPath.get(d.file_path) ?? null, file_name: d.file_name, mime_type: d.mime_type, created_at: d.created_at })),
    })),
  };
}

/** Add / edit a fleet car. */
export async function saveFleetCar(input: { id?: string; plate: string; car_type: string; branch_id: string | null; notes: string | null; active: boolean }): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  const plate = input.plate.replace(/\D/g, '');
  if (plate.length < 5) return { error: 'מספר רכב לא תקין' };
  if (!input.car_type.trim()) return { error: 'נא להזין סוג רכב' };
  const row = { plate, car_type: input.car_type.trim().slice(0, 80), branch_id: input.branch_id || null, notes: (input.notes ?? '').trim().slice(0, 300) || null, active: input.active };
  const { error } = input.id
    ? await ctx.db.from('loaner_fleet').update(row as never).eq('id', input.id)
    : await ctx.db.from('loaner_fleet').insert({ ...row, created_by: ctx.user.id } as never);
  if (error) return { error: error.message.includes('duplicate') ? 'הרכב כבר קיים ברשימה' : error.message };
  revalidatePath('/loaners');
  return { ok: true };
}

/** Find the customer's case by its plate (cases the user can see — RLS). */
export async function findCaseForLoaner(plateInput: string): Promise<{ matches: { case_id: string; case_key: string | null; customer_name: string | null; phone: string | null; branch_id: string; branch_name: string | null; opened_at: string | null; closed: boolean }[]; error?: string }> {
  const ctx = await me();
  if (!ctx) return { matches: [], error: 'אין הרשאה' };
  const plate = plateInput.replace(/\D/g, '');
  if (plate.length < 5) return { matches: [], error: 'מספר רכב לא תקין' };
  const { data, error } = await ctx.supabase
    .from('cases')
    .select('id, case_key, customer_name, phone, branch_id, opened_at, closed_at, cars!inner(license_plate), branches(name)')
    .eq('cars.license_plate', plate)
    .is('deleted_at', null)
    .order('opened_at', { ascending: false })
    .limit(5);
  if (error) return { matches: [], error: error.message };
  type C = { id: string; case_key: string | null; customer_name: string | null; phone: string | null; branch_id: string; opened_at: string | null; closed_at: string | null; branches: { name: string } | { name: string }[] | null };
  return {
    matches: ((data ?? []) as unknown as C[]).map((c) => ({
      case_id: c.id,
      case_key: c.case_key,
      customer_name: c.customer_name,
      phone: c.phone,
      branch_id: c.branch_id,
      branch_name: (Array.isArray(c.branches) ? c.branches[0] : c.branches)?.name ?? null,
      opened_at: c.opened_at,
      closed: !!c.closed_at,
    })),
  };
}

/** Hand a replacement car to a customer. */
export async function createHandover(fd: FormData): Promise<{ error?: string; ok?: true; id?: string }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  const { db, user } = ctx;
  const fleetId = clean(fd.get('fleet_id'), 40) || null;
  let loanerPlate = clean(fd.get('loaner_plate'), 12).replace(/\D/g, '');
  let loanerType = clean(fd.get('loaner_type'), 80) || null;
  if (fleetId) {
    const { data: car } = await db.from('loaner_fleet').select('plate, car_type, active').eq('id', fleetId).maybeSingle();
    if (!car) return { error: 'הרכב לא נמצא ברשימה' };
    loanerPlate = (car as { plate: string }).plate;
    loanerType = (car as { car_type: string }).car_type;
  }
  if (loanerPlate.length < 5) return { error: 'נא לבחור רכב חליפי' };
  const givenAt = isoOrNull(fd.get('given_at'));
  if (!givenAt) return { error: 'נא להזין תאריך ושעת מסירה' };
  const caseId = clean(fd.get('case_id'), 40) || null;
  let branchId = clean(fd.get('branch_id'), 40) || null;
  if (caseId) {
    const { data: c } = await ctx.supabase.from('cases').select('id, branch_id').eq('id', caseId).maybeSingle();
    if (!c) return { error: 'התיק לא נמצא' };
    branchId = (c as { branch_id: string }).branch_id;
  }

  // Signatures / form photo first, so a failed upload leaves nothing half-saved.
  const prefix = `handovers/${loanerPlate}`;
  const formPhoto = fd.get('signed_form');
  const signedFormPath = formPhoto instanceof File && formPhoto.size ? await upload(db, prefix, formPhoto) : null;
  let signaturePath: string | null = null;
  const sig = clean(fd.get('signature'), 800_000);
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(sig);
  if (m) {
    const png = Buffer.from(m[1], 'base64');
    if (png.length > 200 && png.length < 600_000) {
      const p = `${prefix}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-signature.png`;
      const { error: sErr } = await db.storage.from(BUCKET).upload(p, png, { contentType: 'image/png', upsert: false });
      if (!sErr) signaturePath = p;
    }
  }
  if (!signedFormPath && !signaturePath) return { error: 'חסרה חתימת הלקוח — צלמו את הטופס החתום או החתימו על המסך' };

  // Driver's declaration details (for transferring fines) — required when the
  // customer signs on the screen; on paper they are on the signed form.
  const driver: DriverDetails = {
    full_name: clean(fd.get('driver_name'), 120),
    id_number: clean(fd.get('driver_id'), 12).replace(/\D/g, ''),
    license_number: clean(fd.get('driver_license'), 20),
    address: clean(fd.get('driver_address'), 200),
    phone: clean(fd.get('driver_phone'), 20),
  };
  if (signaturePath && (!driver.full_name || driver.id_number.length < 5 || !driver.license_number || !driver.address)) {
    await db.storage.from(BUCKET).remove([signaturePath, signedFormPath].filter((p): p is string => !!p));
    return { error: 'בהצהרת הנהג חובה: שם מלא, ת.ז., מס׳ רישיון נהיגה וכתובת' };
  }
  const hasDriver = Object.values(driver).some((v) => v);

  const { data, error } = await db
    .from('loaner_handovers')
    .insert({
      fleet_id: fleetId,
      loaner_plate: loanerPlate,
      loaner_type: loanerType,
      case_id: caseId,
      branch_id: branchId,
      customer_plate: clean(fd.get('customer_plate'), 12).replace(/\D/g, '') || null,
      customer_name: clean(fd.get('customer_name'), 120) || null,
      customer_phone: clean(fd.get('customer_phone'), 20) || null,
      given_at: givenAt,
      km_out: int(fd.get('km_out')),
      fuel_out: clean(fd.get('fuel_out'), 20) || null,
      signed_form_path: signedFormPath,
      signature_path: signaturePath,
      agreement_version: signaturePath ? AGREEMENT_VERSION : null,
      agreement_signed_at: signaturePath ? new Date().toISOString() : null,
      agreement_signer: signaturePath ? clean(fd.get('customer_name'), 120) || null : null,
      notes: clean(fd.get('notes'), 500) || null,
      driver_details: hasDriver ? driver : null,
      created_by: user.id,
    } as never)
    .select('id')
    .single();
  if (error || !data) {
    const paths = [signedFormPath, signaturePath].filter((p): p is string => !!p);
    if (paths.length) await db.storage.from(BUCKET).remove(paths);
    return { error: error?.message.includes('uq_loaner_fleet_open') ? 'הרכב הזה כבר אצל לקוח — קודם מחזירים אותו' : error?.message ?? 'שגיאה' };
  }
  const id = (data as { id: string }).id;
  const docErr = await saveDocs(ctx, id, 'OUT', fd.getAll('docs'));
  revalidatePath('/loaners');
  return docErr ? { ok: true, id, error: docErr } : { ok: true, id };
}

async function saveDocs(ctx: NonNullable<Awaited<ReturnType<typeof me>>>, handoverId: string, stage: 'OUT' | 'IN', files: FormDataEntryValue[]): Promise<string | null> {
  let failed = 0;
  for (const f of files) {
    if (!(f instanceof File) || !f.size) continue;
    const p = await upload(ctx.db, `handovers/${handoverId}`, f);
    if (!p) {
      failed++;
      continue;
    }
    const { error } = await ctx.db.from('loaner_documents').insert({ handover_id: handoverId, stage, file_path: p, file_name: f.name.slice(0, 120), mime_type: f.type, uploaded_by: ctx.user.id } as never);
    if (error) failed++;
  }
  return failed ? `${failed} מסמכים לא נשמרו` : null;
}

/** Scan more documents into a hand-over (at hand-over or at return). */
export async function addLoanerDocs(fd: FormData): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  const id = clean(fd.get('handover_id'), 40);
  const stage = clean(fd.get('stage'), 4) === 'IN' ? 'IN' : 'OUT';
  const { data } = await ctx.db.from('loaner_handovers').select('id').eq('id', id).maybeSingle();
  if (!data) return { error: 'לא נמצא' };
  const err = await saveDocs(ctx, id, stage, fd.getAll('docs'));
  revalidatePath('/loaners');
  return err ? { error: err } : { ok: true };
}

/** The car came back. */
export async function returnHandover(fd: FormData): Promise<{ error?: string; ok?: true }> {
  const ctx = await me();
  if (!ctx) return { error: 'אין הרשאה' };
  const id = clean(fd.get('handover_id'), 40);
  const returnedAt = isoOrNull(fd.get('returned_at'));
  if (!returnedAt) return { error: 'נא להזין תאריך ושעת החזרה' };
  const { data: cur } = await ctx.db.from('loaner_handovers').select('id, given_at, returned_at').eq('id', id).maybeSingle();
  const h = cur as { given_at: string; returned_at: string | null } | null;
  if (!h) return { error: 'לא נמצא' };
  if (h.returned_at) return { error: 'הרכב כבר סומן כמוחזר' };
  if (new Date(returnedAt) < new Date(h.given_at)) return { error: 'ההחזרה לפני המסירה — בדקו את התאריך' };
  const { error } = await ctx.db
    .from('loaner_handovers')
    .update({
      returned_at: returnedAt,
      km_in: int(fd.get('km_in')),
      fuel_in: clean(fd.get('fuel_in'), 20) || null,
      return_notes: clean(fd.get('return_notes'), 500) || null,
      returned_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', id)
    .is('returned_at', null);
  if (error) return { error: error.message };
  const docErr = await saveDocs(ctx, id, 'IN', fd.getAll('docs'));
  revalidatePath('/loaners');
  return docErr ? { error: docErr } : { ok: true };
}
