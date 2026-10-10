// End-of-day report email to Amit (requested 2026-10-10). Sent by the cron
// (round 6 in /api/cron/enter-work-reminders) once per work day from
// DAILY_REPORT_HOUR Israel time. "Once" is enforced by Resend's
// Idempotency-Key (one key per date): later cron runs that day are refused by
// Resend (409) and nothing is sent twice, with no table of our own.
//
// Amit's list: referrals turned into cases today; open referrals per branch;
// open cases per branch; cases closed today. Add rows to SECTIONS' data below.

import type { SupabaseClient } from '@supabase/supabase-js';

export const DAILY_REPORT_HOUR = 18;
export const DAILY_REPORT_TO = ['Amitm@toyota-tehila.co.il'];

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM = 'תהילה ניהול מוסך <reports@toyota-tehila.co.il>';

/** UTC instant of 00:00 Israel time on isoDate (DST-safe). */
function israelDayStart(isoDate: string): Date {
  for (const offset of ['+03:00', '+02:00']) {
    const d = new Date(`${isoDate}T00:00:00${offset}`);
    const hour = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false }).format(d);
    if (hour === '0' || hour === '24' || hour === '00') return d;
  }
  return new Date(`${isoDate}T00:00:00+02:00`);
}

type Branch = { id: string; name: string };
type Counts = { byBranch: Map<string, number>; total: number };

function count(rows: { branch_id: string | null }[]): Counts {
  const byBranch = new Map<string, number>();
  for (const r of rows) if (r.branch_id) byBranch.set(r.branch_id, (byBranch.get(r.branch_id) ?? 0) + 1);
  return { byBranch, total: rows.length };
}

export async function buildDailyReport(db: SupabaseClient, isoDate: string) {
  const start = israelDayStart(isoDate).toISOString();
  const next = new Date(`${isoDate}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = israelDayStart(next.toISOString().slice(0, 10)).toISOString();

  const [branchesRes, openRefRes, openCasesRes, closedRes, convertedRes] = await Promise.all([
    db.from('branches').select('id, name').order('name'),
    db.from('referrals').select('branch_id').eq('status', 'ACTIVE'),
    db.from('cases').select('branch_id').is('closed_at', null).is('deleted_at', null),
    db.from('cases').select('branch_id').is('deleted_at', null).gte('closed_at', start).lt('closed_at', end),
    db.from('referrals').select('branch_id, cases!inner(created_at)').eq('status', 'CONVERTED').is('cases.deleted_at', null).gte('cases.created_at', start).lt('cases.created_at', end),
  ]);
  for (const r of [branchesRes, openRefRes, openCasesRes, closedRes, convertedRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const branches = (branchesRes.data ?? []) as Branch[];
  const sections: { title: string; counts: Counts }[] = [
    { title: 'הפניות שנפתחו לתיקים היום', counts: count((convertedRes.data ?? []) as { branch_id: string }[]) },
    { title: 'הפניות פתוחות', counts: count((openRefRes.data ?? []) as { branch_id: string }[]) },
    { title: 'תיקים פתוחים', counts: count((openCasesRes.data ?? []) as { branch_id: string }[]) },
    { title: 'תיקים שנסגרו היום', counts: count((closedRes.data ?? []) as { branch_id: string }[]) },
  ];
  return { branches, sections };
}

function buildHtml(dateLabel: string, report: Awaited<ReturnType<typeof buildDailyReport>>, appUrl: string): string {
  const th = 'padding:10px 12px;font-size:14px;color:#57534e;font-weight:bold;border-bottom:2px solid #e7e5e4;';
  const td = 'padding:10px 12px;font-size:15px;color:#1c1917;border-bottom:1px solid #f5f5f4;text-align:center;';
  const rows = report.sections
    .map(
      (s) => `<tr>
        <td style="${td}text-align:right;font-weight:bold;">${s.title}</td>
        ${report.branches.map((b) => `<td style="${td}">${s.counts.byBranch.get(b.id) ?? 0}</td>`).join('')}
        <td style="${td}font-weight:bold;background:#fafaf9;">${s.counts.total}</td>
      </tr>`,
    )
    .join('');
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8" /><meta http-equiv="Content-Type" content="text/html; charset=utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:16px;background:#f5f5f4;font-family:Arial,sans-serif;">
  <div dir="rtl" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;padding:20px;">
    <p style="margin:0;font-size:13px;color:#dc2626;font-weight:bold;">תהילה ניהול מוסך</p>
    <h2 style="margin:4px 0 2px;font-size:20px;color:#1c1917;">דוח סוף יום</h2>
    <p style="margin:0 0 16px;font-size:13px;color:#78716c;">${dateLabel}</p>
    <table style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0">
      <thead><tr>
        <th style="${th}text-align:right;"></th>
        ${report.branches.map((b) => `<th style="${th}">${b.name}</th>`).join('')}
        <th style="${th}">סה"כ</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:20px 0 0;"><a href="${appUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;font-size:14px;">כניסה למערכת</a></p>
  </div>
</body>
</html>`;
}

/** Sends today's report. Returns 'duplicate' when it already went out today. */
export async function sendDailyReport(
  db: SupabaseClient,
  isoDate: string,
  appUrl: string,
): Promise<{ ok: true; status: 'sent' | 'duplicate' } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY missing' };

  const report = await buildDailyReport(db, isoDate);
  const [y, m, d] = isoDate.split('-');
  const dateLabel = `${d}/${m}/${y}`;

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
      'Idempotency-Key': `daily-report/${isoDate}`,
    },
    body: JSON.stringify({
      from: FROM,
      to: DAILY_REPORT_TO,
      subject: `דוח סוף יום — ${dateLabel}`,
      html: buildHtml(dateLabel, report, appUrl),
    }),
  });
  // Same key again today: Resend replays the first answer (same payload) or
  // refuses with 409 (numbers changed since) — either way nothing new is sent.
  if (res.status === 409) return { ok: true, status: 'duplicate' };
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `${res.status} ${text.slice(0, 300)}` };
  }
  return { ok: true, status: 'sent' };
}
