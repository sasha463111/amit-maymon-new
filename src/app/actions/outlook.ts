'use server';

import { createHash } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { db, forgetAccess, graphGet, outlookConfigured } from '@/lib/outlook.server';
import { canUseOutlook, platesIn, type AttachTarget, type CaseEmail, type MailFolder, type MailFull, type MailListItem } from '@/lib/outlook';

// 📧 Outlook in the app (16/10) — what the browser may call. Each user reads
// ONLY their own mailbox (their own token); attaching checks that the user may
// see the target case / claim / referral. Every export here is public, so each
// one starts with me().

const COLLECTION_ROLES = new Set(['COLLECTIONS', 'CEO', 'ACCOUNTANT']);
const BUCKET = 'case-emails';
const MAX_ATTACHMENT = 15 * 1024 * 1024;

async function me() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role, is_active, collections_manager, full_name').eq('id', user.id).maybeSingle();
  const p = data as { role: string; is_active: boolean; collections_manager: boolean | null; full_name: string | null } | null;
  if (!p || p.is_active === false) return null;
  return { user, supabase, role: p.role, name: p.full_name ?? '', collectionsSupervisor: p.role === 'CEO' || p.role === 'ACCOUNTANT' || (p.role === 'COLLECTIONS' && !!p.collections_manager) };
}
type Me = NonNullable<Awaited<ReturnType<typeof me>>>;

export async function outlookStatus(): Promise<{ allowed: boolean; configured: boolean; connected: boolean; email: string | null }> {
  const c = await me();
  if (!c || !canUseOutlook(c.role)) return { allowed: false, configured: false, connected: false, email: null };
  const d = db();
  const { data } = d ? await d.from('ms_connections').select('ms_email').eq('user_id', c.user.id).maybeSingle() : { data: null };
  return { allowed: true, configured: outlookConfigured(), connected: !!data, email: (data as { ms_email: string } | null)?.ms_email ?? null };
}

export async function disconnectOutlook(): Promise<{ ok?: true; error?: string }> {
  const c = await me();
  if (!c) return { error: 'לא מחובר' };
  forgetAccess(c.user.id);
  await db()?.from('ms_connections').delete().eq('user_id', c.user.id);
  revalidatePath('/mail');
  return { ok: true };
}

type GMsg = {
  id: string; subject?: string; bodyPreview?: string; receivedDateTime?: string; isRead?: boolean; hasAttachments?: boolean; internetMessageId?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[]; ccRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  body?: { content?: string };
};
const toItem = (m: GMsg): MailListItem => ({
  id: m.id,
  subject: m.subject || '(ללא נושא)',
  fromName: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '',
  fromEmail: m.from?.emailAddress?.address || '',
  receivedAt: m.receivedDateTime || '',
  preview: (m.bodyPreview || '').slice(0, 200),
  isRead: !!m.isRead,
  hasAttachments: !!m.hasAttachments,
});
const names = (r?: GMsg['toRecipients']) => (r ?? []).map((x) => x.emailAddress?.name || x.emailAddress?.address).filter(Boolean).join(', ');

export async function listMail(folder: MailFolder, search?: string, next?: string): Promise<{ items: MailListItem[]; next: string | null; error?: string; reconnect?: boolean }> {
  const c = await me();
  if (!c || !canUseOutlook(c.role)) return { items: [], next: null, error: 'אין הרשאה' };
  const f = folder === 'sentitems' ? 'sentitems' : 'inbox';
  const sel = '$select=id,subject,bodyPreview,receivedDateTime,isRead,hasAttachments,from';
  const q = (search ?? '').trim().replace(/"/g, '').slice(0, 100);
  // A "next" link from Microsoft is only accepted for the Graph host.
  const path = next && next.startsWith('https://graph.microsoft.com/v1.0/') ? next.slice('https://graph.microsoft.com/v1.0'.length) : q ? `/me/mailFolders/${f}/messages?$top=30&${sel}&$search="${encodeURIComponent(q)}"` : `/me/mailFolders/${f}/messages?$top=30&${sel}&$orderby=receivedDateTime desc`;
  const r = await graphGet<{ value: GMsg[]; '@odata.nextLink'?: string }>(c.user.id, path);
  if (!r.ok) return { items: [], next: null, error: r.error, reconnect: r.reconnect };
  return { items: r.data.value.map(toItem), next: r.data['@odata.nextLink'] ?? null };
}

export async function getMail(id: string): Promise<{ mail?: MailFull; suggestions?: AttachTarget[]; error?: string }> {
  const c = await me();
  if (!c || !canUseOutlook(c.role)) return { error: 'אין הרשאה' };
  if (!/^[A-Za-z0-9_=+/-]{10,400}$/.test(id)) return { error: 'מזהה לא תקין' };
  const enc = encodeURIComponent(id);
  const [m, a] = await Promise.all([
    graphGet<GMsg>(c.user.id, `/me/messages/${enc}?$select=id,subject,bodyPreview,receivedDateTime,isRead,hasAttachments,from,toRecipients,ccRecipients,body,internetMessageId`),
    graphGet<{ value: { id: string; name: string; contentType: string; size: number; '@odata.type': string }[] }>(c.user.id, `/me/messages/${enc}/attachments?$select=id,name,contentType,size`),
  ]);
  if (!m.ok) return { error: m.error };
  const mail: MailFull = {
    ...toItem(m.data),
    to: names(m.data.toRecipients),
    cc: names(m.data.ccRecipients),
    bodyHtml: m.data.body?.content ?? '',
    internetMessageId: m.data.internetMessageId ?? null,
    attachments: a.ok ? a.data.value.filter((x) => x['@odata.type'] === '#microsoft.graph.fileAttachment').map((x) => ({ id: x.id, name: x.name, contentType: x.contentType, size: x.size })) : [],
  };
  const text = `${mail.subject} ${mail.preview} ${mail.bodyHtml.replace(/<[^>]+>/g, ' ')}`;
  return { mail, suggestions: await targetsFor(c, platesIn(text), '') };
}

/** Cases / claims / referrals this user may see, by plate(s) or free text. */
async function targetsFor(c: Me, plates: string[], q: string): Promise<AttachTarget[]> {
  const out: AttachTarget[] = [];
  const text = q.trim().replace(/[%,()]/g, '').slice(0, 60);
  const digits = text.replace(/\D/g, '');
  const plateList = plates.length ? plates : digits.length >= 5 ? [digits] : [];
  if (!plateList.length && text.length < 2) return out;

  // Repair cases (RLS: the user's branches).
  {
    let qq = c.supabase.from('cases').select('id, customer_name, closed_at, cars!inner(license_plate)').is('deleted_at', null).order('opened_at', { ascending: false }).limit(6);
    qq = plateList.length ? qq.in('cars.license_plate', plateList) : qq.ilike('customer_name', `%${text}%`);
    const { data } = await qq;
    for (const r of (data ?? []) as { id: string; customer_name: string | null; closed_at: string | null; cars: { license_plate: string } | { license_plate: string }[] }[]) {
      const car = Array.isArray(r.cars) ? r.cars[0] : r.cars;
      out.push({ type: 'CASE', id: r.id, label: `תיק תיקון · ${r.customer_name ?? '—'}`, plate: car?.license_plate ?? null, sub: r.closed_at ? 'סגור' : 'פתוח' });
    }
  }
  // Insurance claims (collectors / CEO / accountant; a collector — own claims only).
  if (COLLECTION_ROLES.has(c.role)) {
    const d = db();
    if (d) {
      let qq = d.from('collection_cases').select('id, customer_name, plate, insurer, claim_number, closed_at, assigned_to').limit(6);
      qq = plateList.length ? qq.in('plate', plateList) : qq.or(`customer_name.ilike.%${text}%,claim_number.ilike.%${text}%`);
      if (!c.collectionsSupervisor) qq = qq.eq('assigned_to', c.user.id);
      const { data } = await qq;
      for (const r of (data ?? []) as { id: string; customer_name: string | null; plate: string | null; insurer: string | null; claim_number: string | null; closed_at: string | null }[]) {
        out.push({ type: 'COLLECTION', id: r.id, label: `תביעת ביטוח · ${r.customer_name ?? '—'}`, plate: r.plate, sub: [r.insurer, r.claim_number ? `תביעה ${r.claim_number}` : null, r.closed_at ? 'סגורה' : null].filter(Boolean).join(' · ') });
      }
    }
  }
  // Referrals (RLS).
  {
    let qq = c.supabase.from('referrals').select('id, customer_name, plate_number, insurance_company').order('created_at', { ascending: false }).limit(4);
    qq = plateList.length ? qq.in('plate_number', plateList) : qq.ilike('customer_name', `%${text}%`);
    const { data } = await qq;
    for (const r of (data ?? []) as { id: string; customer_name: string | null; plate_number: string | null; insurance_company: string | null }[]) {
      out.push({ type: 'REFERRAL', id: r.id, label: `הפניה · ${r.customer_name ?? '—'}`, plate: r.plate_number, sub: r.insurance_company ?? undefined });
    }
  }
  return out;
}

export async function searchAttachTargets(q: string): Promise<AttachTarget[]> {
  const c = await me();
  if (!c || !canUseOutlook(c.role)) return [];
  return targetsFor(c, [], q);
}

/** May this user see / attach to this target? */
async function canSeeTarget(c: Me, type: AttachTarget['type'], id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return false;
  if (type === 'CASE') return !!(await c.supabase.from('cases').select('id').eq('id', id).maybeSingle()).data;
  if (type === 'REFERRAL') return !!(await c.supabase.from('referrals').select('id').eq('id', id).maybeSingle()).data;
  if (!COLLECTION_ROLES.has(c.role)) return false;
  const { data } = (await db()?.from('collection_cases').select('assigned_to').eq('id', id).maybeSingle()) ?? { data: null };
  const r = data as { assigned_to: string | null } | null;
  return !!r && (c.collectionsSupervisor || r.assigned_to === c.user.id);
}

/** "📎 שייך לתיק": save a copy of the email (and its files) with the case. */
export async function attachMailToTarget(messageId: string, type: AttachTarget['type'], targetId: string): Promise<{ ok?: true; error?: string }> {
  const c = await me();
  if (!c || !canUseOutlook(c.role)) return { error: 'אין הרשאה' };
  if (!(await canSeeTarget(c, type, targetId))) return { error: 'אין גישה לתיק הזה' };
  const got = await getMail(messageId);
  if (!got.mail) return { error: got.error ?? 'המייל לא נמצא' };
  const mail = got.mail;
  const d = db();
  if (!d) return { error: 'שרת לא מוגדר' };

  const folder = `${type.toLowerCase()}/${targetId}/${createHash('sha256').update(mail.internetMessageId ?? mail.id).digest('hex').slice(0, 24)}`;
  const files: { name: string; path: string; size: number }[] = [];
  for (const att of mail.attachments.filter((x) => x.size <= MAX_ATTACHMENT).slice(0, 10)) {
    const r = await graphGet<{ contentBytes?: string }>(c.user.id, `/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(att.id)}`);
    if (!r.ok || !r.data.contentBytes) continue;
    const safe = att.name.replace(/[^\w.\-א-ת ]+/g, '_').slice(0, 100) || 'file';
    const path = `${folder}/${files.length + 1}-${safe}`;
    const up = await d.storage.from(BUCKET).upload(path, Buffer.from(r.data.contentBytes, 'base64'), { contentType: att.contentType || 'application/octet-stream', upsert: true });
    if (!up.error) files.push({ name: att.name, path, size: att.size });
  }
  const { error } = await d.from('case_emails').insert({
    target_type: type,
    target_id: targetId,
    internet_message_id: mail.internetMessageId,
    subject: mail.subject.slice(0, 500),
    from_name: mail.fromName.slice(0, 200),
    from_email: mail.fromEmail.slice(0, 200),
    to_list: mail.to.slice(0, 1000),
    received_at: mail.receivedAt || null,
    body_html: mail.bodyHtml.slice(0, 500_000),
    body_preview: mail.preview,
    attachments: files,
    attached_by: c.user.id,
  } as never);
  if (error) return { error: /duplicate|unique/i.test(error.message) ? 'המייל הזה כבר משויך לתיק הזה' : error.message };
  // A line in the claim's log, like any other update.
  if (type === 'COLLECTION') await d.from('collection_case_events').insert({ case_id: targetId, kind: 'EMAIL', body: `📧 שויך מייל: ${mail.subject.slice(0, 150)} (מאת ${mail.fromName || mail.fromEmail})`, created_by: c.user.id } as never);
  revalidatePath(type === 'COLLECTION' ? `/collections/${targetId}` : type === 'CASE' ? `/cases/${targetId}` : `/referrals/${targetId}`);
  return { ok: true };
}

/** The emails saved with a case / claim / referral (with short-lived links to their files). */
export async function listCaseEmails(type: AttachTarget['type'], targetId: string): Promise<CaseEmail[]> {
  const c = await me();
  if (!c || !(await canSeeTarget(c, type, targetId))) return [];
  const d = db();
  if (!d) return [];
  const { data } = await d.from('case_emails').select('id, subject, from_name, from_email, received_at, body_preview, body_html, attachments, attached_by, attached_at').eq('target_type', type).eq('target_id', targetId).order('received_at', { ascending: false });
  type R = { id: string; subject: string | null; from_name: string | null; from_email: string | null; received_at: string | null; body_preview: string | null; body_html: string | null; attachments: { name: string; path: string; size: number }[]; attached_by: string | null; attached_at: string };
  const rows = (data ?? []) as R[];
  const ids = Array.from(new Set(rows.map((r) => r.attached_by).filter((x): x is string => !!x)));
  const { data: people } = ids.length ? await d.from('profiles').select('id, full_name').in('id', ids) : { data: [] };
  const nameOf = new Map(((people ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));
  const paths = rows.flatMap((r) => r.attachments.map((a) => a.path));
  const signed = paths.length ? (await d.storage.from(BUCKET).createSignedUrls(paths, 900)).data ?? [] : [];
  const urlOf = new Map((signed as { path: string | null; signedUrl: string }[]).map((s) => [s.path, s.signedUrl]));
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    fromName: r.from_name,
    fromEmail: r.from_email,
    receivedAt: r.received_at,
    preview: r.body_preview,
    bodyHtml: r.body_html,
    attachments: r.attachments.map((a) => ({ name: a.name, path: urlOf.get(a.path) ?? '', size: a.size })),
    attachedBy: r.attached_by ? nameOf.get(r.attached_by) ?? null : null,
    attachedAt: r.attached_at,
  }));
}
