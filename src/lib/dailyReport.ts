// End-of-day report email to Amit (requested 2026-10-10). Sent by the cron
// (round 6 in /api/cron/enter-work-reminders) once per work day from
// DAILY_REPORT_HOUR Israel time. "Once" is enforced by Resend's
// Idempotency-Key (one key per date): later cron runs that day are refused by
// Resend (409) and nothing is sent twice, with no table of our own.
//
// Amit's list: referrals turned into cases today; open referrals per branch;
// open cases per branch; cases closed today. Add rows to SECTIONS' data below.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendMail } from '@/lib/mailer';

export const DAILY_REPORT_HOUR = 18;
export const DAILY_REPORT_TO = ['Amitm@toyota-tehila.co.il'];


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
    db.from('cases').select('branch_id').is('deleted_at', null).is('written_off_at', null).gte('closed_at', start).lt('closed_at', end),
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
  // The plates themselves (Amit, 2026-10-14) — staff compare the report with
  // their own list of cars that came in, instead of only a count.
  const { data: openedData, error: openedErr } = await db
    .from('cases')
    .select('branch_id, customer_name, created_at, cars(license_plate)')
    .is('deleted_at', null)
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at');
  if (openedErr) throw new Error(openedErr.message);
  const opened = ((openedData ?? []) as { branch_id: string; customer_name: string | null; cars: { license_plate: string | null } | { license_plate: string | null }[] | null }[])
    .map((c) => ({
      branchId: c.branch_id,
      plate: (Array.isArray(c.cars) ? c.cars[0]?.license_plate : c.cars?.license_plate) ?? '—',
      customer: c.customer_name,
    }));
  return { branches, sections, opened };
}

/** 12345678 → 123-45-678, 1234567 → 12-345-67 (as on the plate). */
function plateLabel(p: string): string {
  if (/^\d{8}$/.test(p)) return `${p.slice(0, 3)}-${p.slice(3, 5)}-${p.slice(5)}`;
  if (/^\d{7}$/.test(p)) return `${p.slice(0, 2)}-${p.slice(2, 5)}-${p.slice(5)}`;
  return p;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
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
    <h3 style="margin:22px 0 8px;font-size:16px;color:#1c1917;">רכבים שנפתחו היום (${report.opened.length})</h3>
    ${report.opened.length === 0
      ? '<p style="margin:0;font-size:14px;color:#78716c;">לא נפתחו תיקים היום.</p>'
      : report.branches
          .map((b) => {
            const list = report.opened.filter((o) => o.branchId === b.id);
            if (!list.length) return '';
            return `<p style="margin:10px 0 4px;font-size:14px;font-weight:bold;color:#57534e;">${esc(b.name)} (${list.length})</p>
              <ul style="margin:0;padding-right:18px;font-size:14px;color:#1c1917;line-height:1.7;">${list
                .map((o) => `<li><span dir="ltr" style="font-weight:bold;">${esc(plateLabel(o.plate))}</span>${o.customer ? ` · ${esc(o.customer)}` : ''}</li>`)
                .join('')}</ul>`;
          })
          .join('')}
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
  const report = await buildDailyReport(db, isoDate);
  const [y, m, d] = isoDate.split('-');
  const dateLabel = `${d}/${m}/${y}`;

  // Once per day: src/lib/mailer.ts honours the key with Resend
  // (Idempotency-Key) and with Microsoft 365 (public.sent_emails).
  const res = await sendMail({
    to: DAILY_REPORT_TO,
    subject: `דוח סוף יום — ${dateLabel}`,
    html: buildHtml(dateLabel, report, appUrl),
    onceKey: `daily-report/${isoDate}`,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, status: res.status };
}
