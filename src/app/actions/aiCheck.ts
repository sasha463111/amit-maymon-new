'use server';

import { createClient } from '@/lib/supabase/server';
import { checkClaudeConnection } from '@/lib/stickerReader';
import { mailSender, mailTransport, sendMail } from '@/lib/mailer';

// "🤖 בדיקת חיבור Claude" in Settings (Tomer, 15/10): sticker / invoice reading
// and the advisor all need the Anthropic key. One click says whether it works,
// and why not (no key / invalid / no credit / overloaded).
export async function testClaudeConnection(): Promise<{ ok: boolean; detail: string; source?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, detail: '', error: 'לא מחובר' };
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if ((data as { role: string } | null)?.role !== 'CEO') return { ok: false, detail: '', error: 'אין הרשאה' };
  const r = await checkClaudeConnection();
  return { ok: r.ok, detail: r.detail, source: r.source === 'env' ? 'Vercel' : r.source === 'vault' ? 'Vault' : 'אין' };
}

/** "📧 בדיקת דואר" (16/10): which way the app's own mail goes out (Microsoft 365
 *  mailbox or Resend) and a test email to the CEO — for the switch off Resend. */
export async function testMailTransport(): Promise<{ ok: boolean; detail: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, detail: '', error: 'לא מחובר' };
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if ((data as { role: string } | null)?.role !== 'CEO') return { ok: false, detail: '', error: 'אין הרשאה' };
  const via = mailTransport();
  const r = await sendMail({ to: [user.email], subject: 'בדיקת דואר — מערכת תהילה', html: `<div dir="rtl"><p>זו הודעת בדיקה מהמערכת.</p><p>נשלחה דרך: <b>${via === 'graph' ? `תיבת Microsoft 365 (${mailSender()})` : 'Resend'}</b></p></div>` });
  const route = via === 'graph' ? `Microsoft 365 · ${mailSender()}` : 'Resend (עוד לא עבר לתיבה של החברה)';
  return r.ok ? { ok: true, detail: `נשלח אליך מייל בדיקה · דרך ${route}` } : { ok: false, detail: `השליחה נכשלה דרך ${route}: ${r.error.slice(0, 160)}` };
}
