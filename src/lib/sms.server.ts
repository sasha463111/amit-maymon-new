// Sending an SMS from the server (login codes, 2026-10-15). One provider
// adapter for now — InforU (v2 JSON REST, Basic auth with user:API-token).
// Configured only through env, never in the repo:
//   SMS_PROVIDER=inforu, INFORU_USER, INFORU_TOKEN, SMS_SENDER (default "Tehila").
// Until it is configured, isSmsConfigured() is false and the SMS login step
// is not enforced on anyone (so nobody can be locked out).

export function isSmsConfigured(): boolean {
  return process.env.SMS_PROVIDER === 'inforu' && !!process.env.INFORU_USER && !!process.env.INFORU_TOKEN;
}

/** "050-1234567" / "0501234567" / "+972501234567" → "0501234567" (null if not an Israeli mobile). */
export function normalizeMobile(raw: string | null | undefined): string | null {
  let d = (raw ?? '').replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  return /^05\d{8}$/.test(d) ? d : null;
}

export async function sendSms(phone: string, message: string): Promise<{ ok?: true; error?: string }> {
  if (!isSmsConfigured()) return { error: 'ספק ה-SMS עוד לא מחובר' };
  const to = normalizeMobile(phone);
  if (!to) return { error: 'מספר נייד לא תקין' };
  const auth = Buffer.from(`${process.env.INFORU_USER}:${process.env.INFORU_TOKEN}`).toString('base64');
  try {
    const res = await fetch('https://capi.inforu.co.il/api/v2/SMS/SendSms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        Data: {
          Message: message,
          Recipients: [{ Phone: to }],
          Settings: { Sender: process.env.SMS_SENDER || 'Tehila' },
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
