import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { resolveToken, serviceClient, requestMeta } from '@/lib/customerDocLinks.server';
import { CONSENT_VERSION, MAX_FILES_PER_LINK, MAX_FILE_BYTES, docItemsFor } from '@/lib/customerDocs';

// Public endpoint behind the customer documents link (/d/[token]). Upload-only:
// nothing here returns documents or referral data beyond what the page shows.
// Actions: consent → upload (repeatable) → done.

export const dynamic = 'force-dynamic';

const ACCEPTED = /^(image\/(jpeg|png|heic|heif|webp)|application\/pdf)$/i;
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif', 'image/webp': 'webp', 'application/pdf': 'pdf',
};

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, error: message }, { status });

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail('בקשה לא תקינה');
  }
  const state = await resolveToken(form.get('token') as string | null);
  if (!state.ok) {
    const msg = state.reason === 'expired' ? 'תוקף הקישור פג' : state.reason === 'revoked' ? 'הקישור בוטל' : 'קישור לא תקין';
    return fail(msg, state.reason === 'unavailable' ? 503 : 403);
  }
  const { link, referral } = state.value;
  const db = serviceClient()!;
  const meta = requestMeta(req.headers);
  const action = form.get('action');

  if (action === 'consent') {
    if (form.get('agree') !== 'yes') return fail('יש לאשר את תנאי ההסכמה');
    if (!link.consent_at) {
      await db
        .from('customer_doc_links')
        .update({ consent_at: new Date().toISOString(), consent_version: CONSENT_VERSION, consent_ip: meta.ip, consent_ua: meta.ua } as never)
        .eq('id', link.id)
        .is('consent_at', null);
    }
    return NextResponse.json({ ok: true });
  }

  if (!link.consent_at) return fail('יש לאשר את תנאי ההסכמה לפני ההעלאה', 403);

  if (action === 'upload') {
    const kind = String(form.get('kind') ?? '');
    const item = docItemsFor(referral.claim_type).find((i) => i.kind === kind);
    if (!item) return fail('סוג מסמך לא מוכר');
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return fail('הקובץ ריק');
    if (file.size > MAX_FILE_BYTES) return fail('הקובץ גדול מדי (עד 20MB)');
    if (!ACCEPTED.test(file.type)) return fail('אפשר להעלות רק תמונה או PDF');

    const { count } = await db
      .from('referral_documents')
      .select('id', { count: 'exact', head: true })
      .eq('via_link_id', link.id);
    if ((count ?? 0) >= MAX_FILES_PER_LINK) return fail('הגעת למספר הקבצים המרבי בקישור הזה');

    // The customer's file name is never used for the path.
    const ext = EXT[file.type.toLowerCase()] ?? 'bin';
    const path = `${referral.id}/customer-${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
    const { error: upErr } = await db.storage.from('referral-documents').upload(path, file, { upsert: false, contentType: file.type });
    if (upErr) return fail('שגיאה בהעלאה, נסה/י שוב', 500);
    const { error: insErr } = await db.from('referral_documents').insert({
      referral_id: referral.id,
      file_name: `${item.label} (לקוח).${ext}`,
      file_path: path,
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: null,
      doc_kind: kind,
      via_link_id: link.id,
      upload_ip: meta.ip,
      upload_ua: meta.ua,
    } as never);
    if (insErr) {
      await db.storage.from('referral-documents').remove([path]);
      return fail('שגיאה בשמירה, נסה/י שוב', 500);
    }
    // First file of this link → let the clerk know right away.
    if ((count ?? 0) === 0) await notifyClerk(db, link.created_by, referral, 'הלקוח התחיל להעלות מסמכים');
    return NextResponse.json({ ok: true });
  }

  if (action === 'done') {
    if (!link.completed_at) {
      await db.from('customer_doc_links').update({ completed_at: new Date().toISOString() } as never).eq('id', link.id);
      const { count } = await db
        .from('referral_documents')
        .select('id', { count: 'exact', head: true })
        .eq('via_link_id', link.id);
      await notifyClerk(db, link.created_by, referral, `הלקוח סיים להעלות מסמכים (${count ?? 0} קבצים)`);
    }
    return NextResponse.json({ ok: true });
  }

  return fail('פעולה לא מוכרת');
}

async function notifyClerk(
  db: NonNullable<ReturnType<typeof serviceClient>>,
  userId: string | null,
  referral: { id: string; customer_name: string | null; plate_number: string | null },
  title: string,
) {
  if (!userId) return;
  await db.from('notifications').insert({
    user_id: userId,
    type: 'CUSTOMER_DOCS',
    title: `📲 ${title}`,
    body: [referral.customer_name, referral.plate_number].filter(Boolean).join(' · ') || null,
    action_url: `/referrals/${referral.id}`,
    read: false,
  } as never);
}
