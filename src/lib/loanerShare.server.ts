import 'server-only';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { hashToken } from '@/lib/customerDocLinks.server';
import type { DriverDetails } from '@/lib/loaners';
import type { Handover } from '@/app/actions/loaners';

// The customer's copy of the signed replacement-car documents (/l/[token]).
// Server-only on purpose: an export of a 'use server' file is a public endpoint.

const BUCKET = 'loaner-docs';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The customer's link: the signed documents, read-only (public page /l/[token]). */
export async function loanerByShareToken(token: string): Promise<{ handover: Handover; signatureUrl: string | null; returnSignatureUrl: string | null } | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const db = serviceClient();
  if (!db) return null;
  const { data } = await db.from('loaner_handovers').select('id, share_expires_at').eq('share_token_hash', hashToken(token)).maybeSingle();
  const row = data as { id: string; share_expires_at: string | null } | null;
  if (!row || !row.share_expires_at || new Date(row.share_expires_at).getTime() < Date.now()) return null;
  const { data: h } = await db.from('loaner_handovers').select('*').eq('id', row.id).maybeSingle();
  if (!h) return null;
  const x = h as Record<string, unknown> & { signature_path: string | null; return_signature_path: string | null; branch_id: string | null };
  const paths = [x.signature_path, x.return_signature_path].filter((p): p is string => !!p);
  const [signed, branch] = await Promise.all([
    paths.length ? db.storage.from(BUCKET).createSignedUrls(paths, 60 * 30) : Promise.resolve({ data: [] }),
    x.branch_id ? db.from('branches').select('name').eq('id', x.branch_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const urlByPath = new Map(((signed.data ?? []) as { path: string | null; signedUrl: string }[]).map((s) => [s.path, s.signedUrl]));
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    signatureUrl: x.signature_path ? urlByPath.get(x.signature_path) ?? null : null,
    returnSignatureUrl: x.return_signature_path ? urlByPath.get(x.return_signature_path) ?? null : null,
    handover: {
      id: x.id as string,
      fleet_id: null,
      loaner_plate: x.loaner_plate as string,
      loaner_type: (x.loaner_type as string | null) ?? null,
      case_id: null,
      branch_name: (branch.data as { name: string } | null)?.name ?? null,
      customer_plate: (x.customer_plate as string | null) ?? null,
      customer_name: (x.customer_name as string | null) ?? null,
      customer_phone: null,
      given_at: x.given_at as string,
      returned_at: (x.returned_at as string | null) ?? null,
      km_out: n(x.km_out),
      km_in: n(x.km_in),
      fuel_out: (x.fuel_out as string | null) ?? null,
      fuel_in: (x.fuel_in as string | null) ?? null,
      signed_form_url: null,
      signature_url: null,
      agreement_signed_at: (x.agreement_signed_at as string | null) ?? null,
      notes: (x.notes as string | null) ?? null,
      return_notes: (x.return_notes as string | null) ?? null,
      driver: (x.driver_details as Partial<DriverDetails> | null) ?? null,
      customer_car_model: (x.customer_car_model as string | null) ?? null,
      waiver: !!x.waiver,
      waiver_from: (x.waiver_from as string | null) ?? null,
      waiver_to: (x.waiver_to as string | null) ?? null,
      return_signature_url: null,
      created_by_name: null,
      returned_by_name: null,
      docs: [],
    },
  };
}
