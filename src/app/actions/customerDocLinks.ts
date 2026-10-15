'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/permissions';
import { canSendCustomerLink, customerMessage, whatsAppUrl } from '@/lib/customerDocs';
import { APP_ORIGIN, newToken, hashToken, serviceClient } from '@/lib/customerDocLinks.server';
import { KIT_DOCS, cleanKitValues, kitDoc } from '@/lib/claimKit';

// Customer documents link — staff side (Amit, 2026-10-14). The referral must
// be visible to the caller under RLS; writes go through the service client.

async function staff(referralId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' as const };
  const { data: prof } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();
  const me = prof as { role: string; full_name: string | null } | null;
  if (!me || !canSendCustomerLink(me.role)) return { error: 'אין הרשאה לשלוח קישור ללקוח' as const };
  if (!(await hasPermission(supabase, 'create_referral'))) return { error: 'אין הרשאה לנהל הפניות' as const };
  const { data: ref } = await supabase
    .from('referrals')
    .select('id, customer_name, plate_number, phone, branch_id, branches(name)')
    .eq('id', referralId)
    .maybeSingle();
  if (!ref) return { error: 'ההפניה לא נמצאה' as const };
  const r = ref as { id: string; customer_name: string | null; plate_number: string | null; phone: string | null; branch_id: string; branches: { name: string } | { name: string }[] | null };
  const branch = Array.isArray(r.branches) ? r.branches[0] : r.branches;
  return { user, me, referral: { ...r, branchName: branch?.name ?? null } };
}

/** New link for the referral (any earlier open link is revoked — one live link).
 *  With `kit`: the link also carries claim-kit documents to fill and sign (stage 2). */
export async function createCustomerDocLink(referralId: string, kit?: { docs: string[]; values: Record<string, unknown> }): Promise<
  { error: string } | { error: null; url: string; message: string; whatsapp: string | null; expiresAt: string }
> {
  const ctx = await staff(referralId);
  if ('error' in ctx) return { error: ctx.error ?? 'שגיאה' };
  const db = serviceClient();
  if (!db) return { error: 'שרת לא מוגדר' };

  const now = new Date().toISOString();
  await db
    .from('customer_doc_links')
    .update({ revoked_at: now, revoked_by: ctx.user.id } as never)
    .eq('referral_id', referralId)
    .is('revoked_at', null)
    .gt('expires_at', now);

  const kitDocs = kit ? KIT_DOCS.map((d) => d.id).filter((id) => kit.docs.includes(id)) : [];
  if (kit && !kitDocs.length) return { error: 'לא נבחרו מסמכים לחתימה' };
  const token = newToken();
  const { data, error } = await db
    .from('customer_doc_links')
    .insert({
      referral_id: referralId,
      token_hash: hashToken(token),
      created_by: ctx.user.id,
      ...(kitDocs.length ? { kit_docs: kitDocs, kit_values: cleanKitValues(kit?.values) } : {}),
    } as never)
    .select('expires_at')
    .single();
  if (error || !data) return { error: `שגיאה ביצירת הקישור: ${error?.message ?? ''}` };

  const url = `${APP_ORIGIN}/d/${token}`;
  const message = customerMessage({
    customerName: ctx.referral.customer_name,
    clerkName: ctx.me.full_name,
    branchName: ctx.referral.branchName,
    plate: ctx.referral.plate_number,
    url,
    kitCount: kitDocs.length,
  });
  revalidatePath(`/referrals/${referralId}`);
  return { error: null, url, message, whatsapp: whatsAppUrl(ctx.referral.phone, message), expiresAt: (data as { expires_at: string }).expires_at };
}

export async function revokeCustomerDocLink(referralId: string, linkId: string): Promise<{ error: string | null }> {
  const ctx = await staff(referralId);
  if ('error' in ctx) return { error: ctx.error ?? 'שגיאה' };
  const db = serviceClient();
  if (!db) return { error: 'שרת לא מוגדר' };
  const { error } = await db
    .from('customer_doc_links')
    .update({ revoked_at: new Date().toISOString(), revoked_by: ctx.user.id } as never)
    .eq('id', linkId)
    .eq('referral_id', referralId)
    .is('revoked_at', null);
  if (error) return { error: error.message };
  revalidatePath(`/referrals/${referralId}`);
  return { error: null };
}

// ---- claim kit, stage 2: what the customer signed (staff view) -------------------

export type KitSigned = { docId: string; title: string; values: Record<string, string>; signatureUrl: string | null; signedAt: string; ip: string | null; ua: string | null; version: string };
export type KitLinkStatus = { linkId: string; sentAt: string; expiresAt: string; docs: { id: string; title: string }[]; values: Record<string, string>; consented: boolean; completed: boolean; signed: KitSigned[]; done: boolean } | null;

/** The latest kit sent to the customer for this referral, and what was signed. */
export async function getKitStatus(referralId: string): Promise<KitLinkStatus> {
  const ctx = await staff(referralId);
  if ('error' in ctx) return null;
  const db = serviceClient();
  if (!db) return null;
  const { data: link } = await db
    .from('customer_doc_links')
    .select('id, created_at, expires_at, consent_at, completed_at, kit_docs, kit_values, kit_signed_at')
    .eq('referral_id', referralId)
    .not('kit_docs', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const l = link as { id: string; created_at: string; expires_at: string; consent_at: string | null; completed_at: string | null; kit_docs: string[]; kit_values: Record<string, string> | null; kit_signed_at: string | null } | null;
  if (!l) return null;
  const { data: rows } = await db.from('kit_signatures').select('doc_id, doc_title, values, signature_path, signed_at, ip, ua, kit_version').eq('link_id', l.id).order('signed_at');
  type R = { doc_id: string; doc_title: string; values: Record<string, string>; signature_path: string; signed_at: string; ip: string | null; ua: string | null; kit_version: string };
  const rs = (rows ?? []) as R[];
  const signedUrls = rs.length ? (await db.storage.from('referral-documents').createSignedUrls(rs.map((r) => r.signature_path), 3600)).data ?? [] : [];
  const urlByPath = new Map((signedUrls as { path: string | null; signedUrl: string }[]).map((x) => [x.path, x.signedUrl]));
  return {
    linkId: l.id,
    sentAt: l.created_at,
    expiresAt: l.expires_at,
    docs: l.kit_docs.map((id) => ({ id, title: kitDoc(id)?.title ?? id })),
    values: l.kit_values ?? {},
    consented: !!l.consent_at,
    completed: !!l.completed_at,
    signed: rs.map((r) => ({ docId: r.doc_id, title: r.doc_title, values: r.values ?? {}, signatureUrl: urlByPath.get(r.signature_path) ?? null, signedAt: r.signed_at, ip: r.ip, ua: r.ua, version: r.kit_version })),
    done: !!l.kit_signed_at,
  };
}
