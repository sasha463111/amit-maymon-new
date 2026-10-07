// Email copy of a notification, sent alongside the push by /api/push/dispatch
// (requested by Amit, 2026-10-06). Same Resend account and sender as the
// daily summary report (src/app/actions/reports.ts).
//
// Capped at DAILY_LIMIT per recipient per Israel day by
// claim_notification_email(); the email that uses the last slot says so, so
// silence after it is explained rather than looking like a fault.

export const DAILY_EMAIL_LIMIT = 50;

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM = 'תהילה ניהול מוסך <reports@toyota-tehila.co.il>';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "רכב 12345678 · ישראל ישראלי" — whichever parts are known. */
function carLine(plate?: string | null, customer?: string | null): string {
  return [plate ? `רכב ${plate}` : null, customer || null].filter(Boolean).join(' · ');
}

function buildHtml(opts: { title: string; body: string; link: string; slot: number; plate?: string | null; customer?: string | null }): string {
  const isLast = opts.slot >= DAILY_EMAIL_LIMIT;
  const limitNotice = isLast
    ? `<div style="margin-top:20px;padding:12px 14px;background:#fff7ed;border:1px solid #fdba74;border-radius:8px;color:#9a3412;font-size:14px;">
         ⚠️ זהו המייל ה-${DAILY_EMAIL_LIMIT} היום — הגעת למכסה היומית.<br>
         מעתה ועד מחר לא יישלחו התראות במייל. ההתראות ממשיכות להגיע כרגיל באפליקציה ובפוש.
       </div>`
    : '';
  const body = opts.body
    ? `<p style="margin:8px 0 0;font-size:15px;color:#44403c;white-space:pre-wrap;">${escapeHtml(opts.body)}</p>`
    : '';
  return `<!doctype html>
<html dir="rtl" lang="he">
<head>
  <!-- Explicit charset: without it some mail clients guess a legacy Hebrew
       encoding and show garbled characters (seen once with the daily report). -->
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:24px;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e7e5e4;direction:rtl;text-align:right;">
    <div style="font-size:13px;color:#b91c1c;font-weight:bold;margin-bottom:8px;">תהילה — התראה חדשה</div>
    <h1 style="margin:0;font-size:20px;color:#1c1917;">${escapeHtml(opts.title)}</h1>
    ${carLine(opts.plate, opts.customer) ? `<p style="margin:6px 0 0;font-size:16px;font-weight:bold;color:#1c1917;">${escapeHtml(carLine(opts.plate, opts.customer))}</p>` : ''}
    ${body}
    <a href="${escapeHtml(opts.link)}" style="display:inline-block;margin-top:20px;padding:10px 18px;background:#b91c1c;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold;">פתח במערכת</a>
    ${limitNotice}
    <p style="margin-top:24px;font-size:12px;color:#a8a29e;">מייל ${opts.slot} מתוך ${DAILY_EMAIL_LIMIT} היום</p>
  </div>
</body>
</html>`;
}

export async function sendNotificationEmail(opts: {
  to: string;
  title: string;
  body: string;
  link: string;
  slot: number;
  plate?: string | null;
  customer?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY missing' };

  const isLast = opts.slot >= DAILY_EMAIL_LIMIT;
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      from: FROM,
      to: [opts.to],
      // e.g. "תיק חדש נפתח — רכב 12345678 · ישראל ישראלי"
      subject: [opts.title, carLine(opts.plate, opts.customer)].filter(Boolean).join(' — ') + (isLast ? ' (מייל אחרון להיום)' : ''),
      html: buildHtml(opts),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `${res.status} ${text.slice(0, 300)}` };
  }
  return { ok: true };
}
