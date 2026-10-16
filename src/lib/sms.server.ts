// Sending an SMS from the server (login codes, 2026-10-15). Two provider
// adapters, chosen by env (never in the repo):
//   • 019 (Tomer's choice, 15/10) — SMS_PROVIDER=019, SMS019_USER (the account
//     username), SMS019_TOKEN (API token from 019's web UI: הגדרות → ניהול
//     Token API; tokens EXPIRE — renew before the date shown there).
//     JSON POST https://019sms.co.il/api, Bearer token, status 0 = accepted.
//   • InforU — SMS_PROVIDER=inforu, INFORU_USER, INFORU_TOKEN.
//   SMS_SENDER: the sender name (≤11 English letters/digits; default "Tehila").
// Until it is configured, isSmsConfigured() is false and the SMS login step
// is not enforced on anyone (so nobody can be locked out).

type Provider = '019' | 'inforu';

function provider(): Provider | null {
  const p = process.env.SMS_PROVIDER;
  if (p === '019' && process.env.SMS019_USER && process.env.SMS019_TOKEN) return '019';
  if (p === 'inforu' && process.env.INFORU_USER && process.env.INFORU_TOKEN) return 'inforu';
  return null;
}

export function isSmsConfigured(): boolean {
  return provider() !== null;
}

const sender = () => (process.env.SMS_SENDER || 'Tehila').replace(/[^A-Za-z0-9]/g, '').slice(0, 11) || 'Tehila';

/** "050-1234567" / "0501234567" / "+972501234567" → "0501234567" (null if not an Israeli mobile). */
export function normalizeMobile(raw: string | null | undefined): string | null {
  let d = (raw ?? '').replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  return /^05\d{8}$/.test(d) ? d : null;
}

export async function sendSms(phone: string, message: string, opts: { dryRun?: boolean } = {}): Promise<{ ok?: true; error?: string }> {
  const p = provider();
  if (!p) return { error: 'ספק ה-SMS עוד לא מחובר' };
  const to = normalizeMobile(phone);
  if (!to) return { error: 'מספר נייד לא תקין' };
  if (p === '019') return send019(to, message, !!opts.dryRun);
  const auth = Buffer.from(`${process.env.INFORU_USER}:${process.env.INFORU_TOKEN}`).toString('base64');
  try {
    const res = await fetch('https://capi.inforu.co.il/api/v2/SMS/SendSms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        Data: {
          Message: message,
          Recipients: [{ Phone: to }],
          Settings: { Sender: sender() },
        },
      }),
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => null)) as { StatusId?: number; StatusDescription?: string } | null;
    if (!res.ok || body?.StatusId !== 1) {
      console.error('[sms] send failed', res.status, body?.StatusId, body?.StatusDescription);
      return { error: 'שליחת ה-SMS נכשלה' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[sms] send threw', e);
    return { error: 'שליחת ה-SMS נכשלה' };
  }
}

/** 019sms: https://docs.019sms.co.il/sms/send-sms.html — dryRun uses /api/test
 *  (validates the request and the token without sending anything). */
async function send019(to: string, message: string, dryRun: boolean): Promise<{ ok?: true; error?: string }> {
  try {
    const res = await fetch(`https://019sms.co.il/api${dryRun ? '/test' : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMS019_TOKEN}` },
      body: JSON.stringify({
        sms: {
          user: { username: process.env.SMS019_USER },
          source: sender(),
          destinations: { phone: [{ _: to }] },
          message,
        },
      }),
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => null)) as { status?: number | string; message?: string } | null;
    if (!res.ok || Number(body?.status) !== 0) {
      // Never log the token; the provider's status text says what is wrong
      // (expired token, unapproved sender, no balance…).
      console.error('[sms:019] send failed', res.status, body?.status, body?.message);
      if (/credit|balance/i.test(String(body?.message ?? ''))) await alertSmsCredit(0).catch(() => null);
      return { error: `שליחת ה-SMS נכשלה (019: ${String(body?.message ?? res.status).slice(0, 120)})` };
    }
    return { ok: true };
  } catch (e) {
    console.error('[sms:019] send threw', e);
    return { error: 'שליחת ה-SMS נכשלה' };
  }
}

// ── 019 credit (16/10): the account ran out and every login code failed with
// "Not enough credit" (Ilanit, Nissim) before anyone noticed. Now the CEOs get
// a note when the balance is low (cron round 13) or a send fails for credit —
// at most once per 12 h, so a locked-out morning doesn't flood the bell.

/** Low-balance threshold, in 019 units (≈ messages). */
export const SMS_LOW_BALANCE = 100;
const CREDIT_ALERT_TITLE = '📱 קרדיט ה-SMS ב-019';

/** Remaining 019 balance (null when not on 019 / the request failed). */
export async function smsBalance(): Promise<number | null> {
  if (provider() !== '019') return null;
  try {
    const res = await fetch('https://019sms.co.il/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMS019_TOKEN}` },
      body: JSON.stringify({ balance: { user: { username: process.env.SMS019_USER } } }),
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => null)) as { status?: number | string; balance?: number | string } | null;
    if (!res.ok || Number(body?.status) !== 0) return null;
    const n = Number(body?.balance);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Note to the active CEOs about SMS credit; skipped if one went out in the last 12 h. */
export async function alertSmsCredit(balance: number | null): Promise<{ sent: number } | { skipped: true } | { error: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: 'no service client' };
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const since = new Date(Date.now() - 12 * 3600_000).toISOString();
  const { count } = await db.from('notifications').select('id', { count: 'exact', head: true }).like('title', `${CREDIT_ALERT_TITLE}%`).gte('created_at', since);
  if (count) return { skipped: true };
  const { data: ceos } = await db.from('profiles').select('id').eq('role', 'CEO').eq('is_active', true);
  const ids = ((ceos ?? []) as { id: string }[]).map((p) => p.id);
  if (!ids.length) return { sent: 0 };
  const empty = balance === null || balance <= 0;
  const { error } = await db.from('notifications').insert(
    ids.map((id) => ({
      user_id: id,
      type: 'DIRECT_NOTE',
      title: empty ? `${CREDIT_ALERT_TITLE} נגמר — קודי הכניסה לא נשלחים` : `${CREDIT_ALERT_TITLE} נמוך (${balance} נשארו)`,
      body: empty
        ? 'עובדים עם קוד SMS לא יכולים להיכנס עד שתטעינו קרדיט באתר של 019. בינתיים אפשר לבטל קוד לעובד בהגדרות ← עובדים.'
        : `נשארו ${balance} הודעות בחשבון 019. כדאי להטעין קרדיט באתר של 019 לפני שקודי הכניסה ייעצרו.`,
      action_url: '/settings',
      read: false,
    })) as never,
  );
  return error ? { error: error.message } : { sent: ids.length };
}

export type SmsSentRow = { date: string; phone: string; status: string; ok: boolean };

/** 019 "dlrByDate": every message the account sent in the last `days` (≤7, the
 *  provider's limit) — the source of truth for "how many SMS went out, to whom". */
export async function smsSentReport(days = 7): Promise<{ rows?: SmsSentRow[]; error?: string }> {
  if (provider() !== '019') return { error: 'ספק ה-SMS אינו 019' };
  const fmt = (d: Date) => {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
    const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
    return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}`;
  };
  const now = new Date();
  const from = new Date(now.getTime() - Math.min(7, Math.max(1, days)) * 86_400_000 + 60_000);
  try {
    const res = await fetch('https://019sms.co.il/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMS019_TOKEN}` },
      body: JSON.stringify({ dlrByDate: { user: { username: process.env.SMS019_USER }, transactions: { external_id: 'null' }, from: fmt(from), to: fmt(now) } }),
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => null)) as { status?: number | string; message?: string; transactions?: unknown } | null;
    if (!res.ok || Number(body?.status) !== 0) return { error: `019: ${String(body?.message ?? res.status).slice(0, 120)}` };
    const list = (Array.isArray(body?.transactions) ? body.transactions : body?.transactions ? [body.transactions] : []) as Record<string, unknown>[];
    return {
      rows: list.map((t) => {
        const digits = String(t.phone ?? '').replace(/\D/g, '');
        const phone = digits.startsWith('972') ? '0' + digits.slice(3) : digits.startsWith('0') ? digits : '0' + digits;
        return { date: String(t.date ?? ''), phone, status: String(t.message_he ?? t.he_message ?? t.en_message ?? t.status ?? ''), ok: String(t.status) === '102' };
      }),
    };
  } catch (e) {
    return { error: String(e).slice(0, 120) };
  }
}
