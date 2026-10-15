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
      return { error: `שליחת ה-SMS נכשלה (019: ${String(body?.message ?? res.status).slice(0, 120)})` };
    }
    return { ok: true };
  } catch (e) {
    console.error('[sms:019] send threw', e);
    return { error: 'שליחת ה-SMS נכשלה' };
  }
}
