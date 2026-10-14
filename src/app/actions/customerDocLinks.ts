'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/permissions';
import { canSendCustomerLink, customerMessage, whatsAppUrl } from '@/lib/customerDocs';
import { APP_ORIGIN, newToken, hashToken, serviceClient } from '@/lib/customerDocLinks.server';

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

/** New link for the referral (any earlier open link is revoked — one live link). */
export async function createCustomerDocLink(referralId: string): Promise<
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

  const token = newToken();
  const { data, error } = await db
    .from('customer_doc_links')
    .insert({ referral_id: referralId, token_hash: hashToken(token), created_by: ctx.user.id } as never)
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
