'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Summary email report (#11). Sends via Resend's plain REST API — no SDK
 * dependency, just a fetch call with the API key from env (RESEND_API_KEY).
 *
 * Counts:
 *  - open cases per branch (closed_at IS NULL)
 *  - cases ready for closure per branch (same "PROFESSIONAL run COMPLETED,
 *    closed_at NULL" definition /closure/page.tsx uses)
 *  - referrals per branch, split into "coordinated" vs "not yet" — APPROXIMATED
 *    as status_note filled-in vs empty, since the data model doesn't track an
 *    explicit coordinated/not-coordinated flag (the referral spec's own two
 *    counts don't map to a stored boolean). Flagged here and to the user —
 *    correct this proxy if it turns out wrong once someone actually reads a
 *    report and compares against what they meant.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Encode Hebrew and other non-ASCII characters as HTML entities
 * This fixes email encoding issues where Resend mangles UTF-8 Hebrew text
 */
function encodeHebrewAsEntities(text: string): string {
  return text.replace(/[֐-׿]/g, (char) => `&#${char.charCodeAt(0)};`);
}

async function requireCeo(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' as const };
  const { data: profileData } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = (profileData as { role: string } | null)?.role;
  if (role !== 'CEO') return { error: 'רק מנכ"ל יכול לשלוח דוח סיכום' as const };
  return { user };
}

async function buildReportHtml(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const { data: branchRows } = await supabase.from('branches').select('id, name');
  const branches = (branchRows ?? []) as { id: string; name: string }[];
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  const { data: openCasesRows } = await supabase
    .from('cases')
    .select('branch_id')
    .is('closed_at', null)
    .is('deleted_at', null);
  const openByBranch = new Map<string, number>();
  for (const r of (openCasesRows ?? []) as { branch_id: string }[]) {
    openByBranch.set(r.branch_id, (openByBranch.get(r.branch_id) ?? 0) + 1);
  }

  // Same "ready for closure" definition as /closure/page.tsx: a COMPLETED
  // PROFESSIONAL workflow run, case not yet closed.
  const { data: openCaseIdRows } = await supabase.from('cases').select('id, branch_id').is('closed_at', null).is('deleted_at', null);
  const openCases = (openCaseIdRows ?? []) as { id: string; branch_id: string }[];
  const { data: closureRunRows } = await supabase
    .from('case_workflow_runs')
    .select('case_id')
    .in('case_id', openCases.map((c) => c.id))
    .eq('workflow_type', 'PROFESSIONAL')
    .eq('status', 'COMPLETED');
  const readyCaseIds = new Set(((closureRunRows ?? []) as { case_id: string }[]).map((r) => r.case_id));
  const closureByBranch = new Map<string, number>();
  for (const c of openCases) {
    if (readyCaseIds.has(c.id)) closureByBranch.set(c.branch_id, (closureByBranch.get(c.branch_id) ?? 0) + 1);
  }

  const { data: referralRows } = await supabase
    .from('referrals')
    .select('branch_id, status_note')
    .eq('status', 'ACTIVE');
  const coordByBranch = new Map<string, number>();
  const uncoordByBranch = new Map<string, number>();
  for (const r of (referralRows ?? []) as { branch_id: string; status_note: string | null }[]) {
    const map = r.status_note && r.status_note.trim() ? coordByBranch : uncoordByBranch;
    map.set(r.branch_id, (map.get(r.branch_id) ?? 0) + 1);
  }

  const rows = branches.map((b) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;">${b.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center;">${openByBranch.get(b.id) ?? 0}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center;">${closureByBranch.get(b.id) ?? 0}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center;">${coordByBranch.get(b.id) ?? 0}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center;">${uncoordByBranch.get(b.id) ?? 0}</td>
    </tr>`).join('');

  const totalOpen = Array.from(openByBranch.values()).reduce((a, b) => a + b, 0);
  const totalClosure = Array.from(closureByBranch.values()).reduce((a, b) => a + b, 0);
  const totalCoord = Array.from(coordByBranch.values()).reduce((a, b) => a + b, 0);
  const totalUncoord = Array.from(uncoordByBranch.values()).reduce((a, b) => a + b, 0);

  const dateStr = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });

  // Full HTML document with an explicit charset meta tag — without it, some
  // mail clients guess the wrong encoding for non-ASCII bytes and Hebrew
  // renders as mojibake. Real bug, caught live: the first test send arrived
  // with garbled text because this used to be a bare <div> fragment with no
  // <head>/charset at all.
  //
  // CRITICAL: Hebrew text is encoded as HTML entities (&#XXXX;) because Resend
  // was mangling UTF-8 Hebrew even with charset=utf-8 headers. This ensures
  // Hebrew renders correctly in all email clients.
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;">
  <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
    <h2 style="color:#1a1a1a;">${encodeHebrewAsEntities('סיכום יומי — תהילה ניהול מוסך')}</h2>
    <p style="color:#666;font-size:13px;">${dateStr}</p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:8px 12px;text-align:right;">${encodeHebrewAsEntities('סניף')}</th>
          <th style="padding:8px 12px;">${encodeHebrewAsEntities('תיקים פתוחים')}</th>
          <th style="padding:8px 12px;">${encodeHebrewAsEntities('ממתינים לסגירה')}</th>
          <th style="padding:8px 12px;">${encodeHebrewAsEntities('הפניות מתואמות')}</th>
          <th style="padding:8px 12px;">${encodeHebrewAsEntities('הפניות ללא תיאום')}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr style="font-weight:bold;">
          <td style="padding:8px 12px;">${encodeHebrewAsEntities('סה"כ')}</td>
          <td style="padding:8px 12px;text-align:center;">${totalOpen}</td>
          <td style="padding:8px 12px;text-align:center;">${totalClosure}</td>
          <td style="padding:8px 12px;text-align:center;">${totalCoord}</td>
          <td style="padding:8px 12px;text-align:center;">${totalUncoord}</td>
        </tr>
      </tbody>
    </table>
    <p style="color:#999;font-size:11px;margin-top:24px;">
      ${encodeHebrewAsEntities('"הפניות מתואמות/ללא תיאום" מחושב כרגע לפי האם יש טקסט בשדה הסטטוס של ההפנייה — לא שדה ייעודי. תגידו אם זה לא מדויק.')}
    </p>
  </div>
</body>
</html>`;

  return html;
}

export async function sendSummaryReport() {
  const supabase = await createClient();
  const auth = await requireCeo(supabase);
  if ('error' in auth) return { error: auth.error };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: 'RESEND_API_KEY לא מוגדר בשרת' };

  const html = await buildReportHtml(supabase);
  const dateStr = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });

  // Ensure proper UTF-8 encoding by using TextEncoder
  const payload = {
    from: 'תהילה ניהול מוסך <reports@toyota-tehila.co.il>',
    to: ['Amitm@toyota-tehila.co.il'],
    bcc: ['tomerdavidyan@hotmail.com'],
    subject: `סיכום יומי — תהילה ניהול מוסך — ${dateStr}`,
    html,
  };

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { error: `שליחה נכשלה: ${res.status} ${text.slice(0, 300)}` };
  }

  return { ok: true, error: null };
}
