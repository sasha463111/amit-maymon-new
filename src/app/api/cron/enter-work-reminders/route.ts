import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendPushToUser } from '@/app/actions/push';

/**
 * Reminder sweep — despite the file/route name (kept as-is so the existing
 * external pinger and its secrets don't need to change), this now covers
 * THREE separate escalation reminders, all on the same "re-notify until
 * acknowledged" idea:
 *
 *  1. ENTER_WORK — re-notifies painters about cars that entered work but
 *     nobody's acknowledged (painter_entered_work_at still null), roughly
 *     every ~2h during the work day.
 *  2. Painter requests — re-notifies the branch's advisors/manager about a
 *     painter's request that's sat PENDING for over an hour with no advisor
 *     response yet.
 *  3. Office closure handoff — re-notifies OFFICE staff about a case that's
 *     been ready for closure for over an hour and nobody with an OFFICE
 *     account has opened the notification yet.
 *
 * WHY THIS IS A PLAIN API ROUTE, NOT A VERCEL CRON JOB: Vercel's Hobby plan
 * only allows a daily cron trigger — nowhere near the cadence any of these
 * need. Instead this is meant to be pinged externally on a real schedule (see
 * .github/workflows/enter-work-reminders.yml, which runs every 30 min via
 * GitHub Actions — free, and not tied to any Vercel plan tier).
 *
 * WHY EVERY 30 MIN INSTEAD OF THE ACTUAL INTERVALS: precision isn't needed
 * here — every check below is idempotent (a *_sent_at column gates re-sends),
 * so pinging more often just means the real interval self-corrects instead of
 * depending on an external scheduler landing exactly on the hour. It also
 * means a late/missed external ping doesn't silently skip a whole cycle.
 *
 * Items 2 and 3 are NOT gated by work-hours/weekend/holiday (unlike item 1) —
 * a painter's request or a case waiting on office doesn't stop being urgent
 * just because it's outside 9-17; the point of "notify again after an hour"
 * is exactly to catch things sitting unattended, whenever that happens.
 *
 * HOLIDAYS: only Israeli weekend (Fri/Sat) is handled programmatically, and
 * only for item 1. Jewish holiday dates need to be hand-maintained in
 * EXTRA_CLOSED_DATES below — there's no reliable way to compute the Hebrew
 * calendar here without a library this project doesn't have, and guessing
 * wrong dates is worse than leaving it to be filled in.
 */

const REMINDER_INTERVAL_MS = 110 * 60 * 1000; // ~110 min: under 2h so drift never skips a cycle
const ESCALATION_INTERVAL_MS = 60 * 60 * 1000; // 1h, as requested for items 2 and 3
// Upper bound so a genuinely old, abandoned PENDING row (weeks-old — someone
// never followed up, or the status just never got updated) doesn't escalate
// forever. Real incident: the first-ever run of this route matched 44
// painter_requests and 9 cases at once — some dated back over a month —
// because nothing had ever been escalated before, so every stale row fired
// simultaneously in one batch. 48h (~2 workdays) is "still worth a nudge",
// beyond that it's stale data, not an active thing to escalate about.
const MAX_ESCALATION_AGE_MS = 48 * 60 * 60 * 1000;
const WORKDAY_START_HOUR = 9;
const WORKDAY_END_HOUR = 17;

// Extra closed dates beyond Fri/Sat: major Jewish holidays (Israel
// observance — Rosh Hashana is 2 days even in Israel, Shmini
// Atzeret/Simchat Torah are ONE combined day in Israel vs two in the
// diaspora) plus Yom HaAtzma'ut. 'YYYY-MM-DD' in Israel local time.
// Covers 2026-2050; past 2050 nothing will be flagged closed until this
// array is extended (same method below).
//
// SOURCE — Hebcal's public API, not a guess (a first attempt at this via a
// web search was wrong and got corrected). Reproducible for future years:
//   https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=off&mod=on&nx=off&year=YYYY&month=x&ss=off&mf=off&c=off&geo=none&i=on
// Take every item with "yomtov":true, plus the one titled "Yom HaAtzma'ut".
//
// Deliberately NOT included: Chol HaMoed (Pesach/Sukkot intermediate days) —
// confirmed the shop works those days, just not full hours. No reduced-hours
// concept exists here, so they're treated as normal work days for now.
const EXTRA_CLOSED_DATES: string[] = [
  // 2026
  '2026-04-02', // פסח א׳
  '2026-04-08', // פסח ז׳ (אחרון של פסח)
  '2026-04-22', // יום העצמאות
  '2026-05-22', // שבועות
  '2026-09-12', // ראש השנה א׳
  '2026-09-13', // ראש השנה ב׳
  '2026-09-21', // יום כיפור
  '2026-09-26', // סוכות א׳
  '2026-10-03', // שמיני עצרת / שמחת תורה
  // 2027
  '2027-04-22', // פסח א׳
  '2027-04-28', // פסח ז׳ (אחרון של פסח)
  '2027-05-12', // יום העצמאות
  '2027-06-11', // שבועות
  '2027-10-02', // ראש השנה א׳
  '2027-10-03', // ראש השנה ב׳
  '2027-10-11', // יום כיפור
  '2027-10-16', // סוכות א׳
  '2027-10-23', // שמיני עצרת / שמחת תורה
  // 2028
  '2028-04-11', // פסח א׳
  '2028-04-17', // פסח ז׳ (אחרון של פסח)
  '2028-05-02', // יום העצמאות
  '2028-05-31', // שבועות
  '2028-09-21', // ראש השנה א׳
  '2028-09-22', // ראש השנה ב׳
  '2028-09-30', // יום כיפור
  '2028-10-05', // סוכות א׳
  '2028-10-12', // שמיני עצרת / שמחת תורה
  // 2029
  '2029-03-31', // פסח א׳
  '2029-04-06', // פסח ז׳ (אחרון של פסח)
  '2029-04-19', // יום העצמאות
  '2029-05-20', // שבועות
  '2029-09-10', // ראש השנה א׳
  '2029-09-11', // ראש השנה ב׳
  '2029-09-19', // יום כיפור
  '2029-09-24', // סוכות א׳
  '2029-10-01', // שמיני עצרת / שמחת תורה
  // 2030
  '2030-04-18', // פסח א׳
  '2030-04-24', // פסח ז׳ (אחרון של פסח)
  '2030-05-08', // יום העצמאות
  '2030-06-07', // שבועות
  '2030-09-28', // ראש השנה א׳
  '2030-09-29', // ראש השנה ב׳
  '2030-10-07', // יום כיפור
  '2030-10-12', // סוכות א׳
  '2030-10-19', // שמיני עצרת / שמחת תורה
  // 2031
  '2031-04-08', // פסח א׳
  '2031-04-14', // פסח ז׳ (אחרון של פסח)
  '2031-04-29', // יום העצמאות
  '2031-05-28', // שבועות
  '2031-09-18', // ראש השנה א׳
  '2031-09-19', // ראש השנה ב׳
  '2031-09-27', // יום כיפור
  '2031-10-02', // סוכות א׳
  '2031-10-09', // שמיני עצרת / שמחת תורה
  // 2032
  '2032-03-27', // פסח א׳
  '2032-04-02', // פסח ז׳ (אחרון של פסח)
  '2032-04-15', // יום העצמאות
  '2032-05-16', // שבועות
  '2032-09-06', // ראש השנה א׳
  '2032-09-07', // ראש השנה ב׳
  '2032-09-15', // יום כיפור
  '2032-09-20', // סוכות א׳
  '2032-09-27', // שמיני עצרת / שמחת תורה
  // 2033
  '2033-04-14', // פסח א׳
  '2033-04-20', // פסח ז׳ (אחרון של פסח)
  '2033-05-04', // יום העצמאות
  '2033-06-03', // שבועות
  '2033-09-24', // ראש השנה א׳
  '2033-09-25', // ראש השנה ב׳
  '2033-10-03', // יום כיפור
  '2033-10-08', // סוכות א׳
  '2033-10-15', // שמיני עצרת / שמחת תורה
  // 2034
  '2034-04-04', // פסח א׳
  '2034-04-10', // פסח ז׳ (אחרון של פסח)
  '2034-04-25', // יום העצמאות
  '2034-05-24', // שבועות
  '2034-09-14', // ראש השנה א׳
  '2034-09-15', // ראש השנה ב׳
  '2034-09-23', // יום כיפור
  '2034-09-28', // סוכות א׳
  '2034-10-05', // שמיני עצרת / שמחת תורה
  // 2035
  '2035-04-24', // פסח א׳
  '2035-04-30', // פסח ז׳ (אחרון של פסח)
  '2035-05-15', // יום העצמאות
  '2035-06-13', // שבועות
  '2035-10-04', // ראש השנה א׳
  '2035-10-05', // ראש השנה ב׳
  '2035-10-13', // יום כיפור
  '2035-10-18', // סוכות א׳
  '2035-10-25', // שמיני עצרת / שמחת תורה
  // 2036
  '2036-04-12', // פסח א׳
  '2036-04-18', // פסח ז׳ (אחרון של פסח)
  '2036-05-01', // יום העצמאות
  '2036-06-01', // שבועות
  '2036-09-22', // ראש השנה א׳
  '2036-09-23', // ראש השנה ב׳
  '2036-10-01', // יום כיפור
  '2036-10-06', // סוכות א׳
  '2036-10-13', // שמיני עצרת / שמחת תורה
  // 2037
  '2037-03-31', // פסח א׳
  '2037-04-06', // פסח ז׳ (אחרון של פסח)
  '2037-04-21', // יום העצמאות
  '2037-05-20', // שבועות
  '2037-09-10', // ראש השנה א׳
  '2037-09-11', // ראש השנה ב׳
  '2037-09-19', // יום כיפור
  '2037-09-24', // סוכות א׳
  '2037-10-01', // שמיני עצרת / שמחת תורה
  // 2038
  '2038-04-20', // פסח א׳
  '2038-04-26', // פסח ז׳ (אחרון של פסח)
  '2038-05-11', // יום העצמאות
  '2038-06-09', // שבועות
  '2038-09-30', // ראש השנה א׳
  '2038-10-01', // ראש השנה ב׳
  '2038-10-09', // יום כיפור
  '2038-10-14', // סוכות א׳
  '2038-10-21', // שמיני עצרת / שמחת תורה
  // 2039
  '2039-04-09', // פסח א׳
  '2039-04-15', // פסח ז׳ (אחרון של פסח)
  '2039-04-28', // יום העצמאות
  '2039-05-29', // שבועות
  '2039-09-19', // ראש השנה א׳
  '2039-09-20', // ראש השנה ב׳
  '2039-09-28', // יום כיפור
  '2039-10-03', // סוכות א׳
  '2039-10-10', // שמיני עצרת / שמחת תורה
  // 2040
  '2040-03-29', // פסח א׳
  '2040-04-04', // פסח ז׳ (אחרון של פסח)
  '2040-04-18', // יום העצמאות
  '2040-05-18', // שבועות
  '2040-09-08', // ראש השנה א׳
  '2040-09-09', // ראש השנה ב׳
  '2040-09-17', // יום כיפור
  '2040-09-22', // סוכות א׳
  '2040-09-29', // שמיני עצרת / שמחת תורה
  // 2041
  '2041-04-16', // פסח א׳
  '2041-04-22', // פסח ז׳ (אחרון של פסח)
  '2041-05-07', // יום העצמאות
  '2041-06-05', // שבועות
  '2041-09-26', // ראש השנה א׳
  '2041-09-27', // ראש השנה ב׳
  '2041-10-05', // יום כיפור
  '2041-10-10', // סוכות א׳
  '2041-10-17', // שמיני עצרת / שמחת תורה
  // 2042
  '2042-04-05', // פסח א׳
  '2042-04-11', // פסח ז׳ (אחרון של פסח)
  '2042-04-24', // יום העצמאות
  '2042-05-25', // שבועות
  '2042-09-15', // ראש השנה א׳
  '2042-09-16', // ראש השנה ב׳
  '2042-09-24', // יום כיפור
  '2042-09-29', // סוכות א׳
  '2042-10-06', // שמיני עצרת / שמחת תורה
  // 2043
  '2043-04-25', // פסח א׳
  '2043-05-01', // פסח ז׳ (אחרון של פסח)
  '2043-05-14', // יום העצמאות
  '2043-06-14', // שבועות
  '2043-10-05', // ראש השנה א׳
  '2043-10-06', // ראש השנה ב׳
  '2043-10-14', // יום כיפור
  '2043-10-19', // סוכות א׳
  '2043-10-26', // שמיני עצרת / שמחת תורה
  // 2044
  '2044-04-12', // פסח א׳
  '2044-04-18', // פסח ז׳ (אחרון של פסח)
  '2044-05-03', // יום העצמאות
  '2044-06-01', // שבועות
  '2044-09-22', // ראש השנה א׳
  '2044-09-23', // ראש השנה ב׳
  '2044-10-01', // יום כיפור
  '2044-10-06', // סוכות א׳
  '2044-10-13', // שמיני עצרת / שמחת תורה
  // 2045
  '2045-04-02', // פסח א׳
  '2045-04-08', // פסח ז׳ (אחרון של פסח)
  '2045-04-20', // יום העצמאות
  '2045-05-22', // שבועות
  '2045-09-12', // ראש השנה א׳
  '2045-09-13', // ראש השנה ב׳
  '2045-09-21', // יום כיפור
  '2045-09-26', // סוכות א׳
  '2045-10-03', // שמיני עצרת / שמחת תורה
  // 2046
  '2046-04-21', // פסח א׳
  '2046-04-27', // פסח ז׳ (אחרון של פסח)
  '2046-05-10', // יום העצמאות
  '2046-06-10', // שבועות
  '2046-10-01', // ראש השנה א׳
  '2046-10-02', // ראש השנה ב׳
  '2046-10-10', // יום כיפור
  '2046-10-15', // סוכות א׳
  '2046-10-22', // שמיני עצרת / שמחת תורה
  // 2047
  '2047-04-11', // פסח א׳
  '2047-04-17', // פסח ז׳ (אחרון של פסח)
  '2047-05-01', // יום העצמאות
  '2047-05-31', // שבועות
  '2047-09-21', // ראש השנה א׳
  '2047-09-22', // ראש השנה ב׳
  '2047-09-30', // יום כיפור
  '2047-10-05', // סוכות א׳
  '2047-10-12', // שמיני עצרת / שמחת תורה
  // 2048
  '2048-03-29', // פסח א׳
  '2048-04-04', // פסח ז׳ (אחרון של פסח)
  '2048-04-16', // יום העצמאות
  '2048-05-18', // שבועות
  '2048-09-08', // ראש השנה א׳
  '2048-09-09', // ראש השנה ב׳
  '2048-09-17', // יום כיפור
  '2048-09-22', // סוכות א׳
  '2048-09-29', // שמיני עצרת / שמחת תורה
  // 2049
  '2049-04-17', // פסח א׳
  '2049-04-23', // פסח ז׳ (אחרון של פסח)
  '2049-05-06', // יום העצמאות
  '2049-06-06', // שבועות
  '2049-09-27', // ראש השנה א׳
  '2049-09-28', // ראש השנה ב׳
  '2049-10-06', // יום כיפור
  '2049-10-11', // סוכות א׳
  '2049-10-18', // שמיני עצרת / שמחת תורה
  // 2050
  '2050-04-07', // פסח א׳
  '2050-04-13', // פסח ז׳ (אחרון של פסח)
  '2050-04-27', // יום העצמאות
  '2050-05-27', // שבועות
  '2050-09-17', // ראש השנה א׳
  '2050-09-18', // ראש השנה ב׳
  '2050-09-26', // יום כיפור
  '2050-10-01', // סוכות א׳
  '2050-10-08', // שמיני עצרת / שמחת תורה
];

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Israel-local date parts, independent of the server's own timezone. */
function israelNow(): { hour: number; weekday: number; isoDate: string } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    hour: parseInt(parts.hour === '24' ? '0' : parts.hour, 10),
    weekday: weekdayMap[parts.weekday] ?? -1,
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

type ServiceClient = NonNullable<ReturnType<typeof getServiceClient>>;

/** Item 1 — ENTER_WORK reminder. Gated by work-hours/weekend/holiday by the caller. */
async function runEnterWorkReminders(supabase: ServiceClient) {
  // Candidates: ENTER_WORK is DONE (painters were already notified once) but
  // painter_entered_work_at is still null (nobody's acknowledged) — "until
  // the car changes status" per the request.
  const { data: activeRuns } = await supabase
    .from('case_workflow_runs')
    .select('id, case_id')
    .eq('workflow_type', 'PROFESSIONAL')
    .eq('status', 'ACTIVE');
  const runs = (activeRuns ?? []) as { id: string; case_id: string }[];
  if (runs.length === 0) return { notified: 0, checked: 0 };

  const runIdToCaseId = new Map(runs.map((r) => [r.id, r.case_id]));
  const { data: enterWorkSteps } = await supabase
    .from('case_workflow_steps')
    .select('run_id')
    .in('run_id', runs.map((r) => r.id))
    .eq('step_key', 'ENTER_WORK')
    .eq('state', 'DONE');
  const doneCaseIds = ((enterWorkSteps ?? []) as { run_id: string }[])
    .map((s) => runIdToCaseId.get(s.run_id))
    .filter((id): id is string => !!id);
  if (doneCaseIds.length === 0) return { notified: 0, checked: 0 };

  const { data: candidateCases } = await supabase
    .from('cases')
    .select('id, branch_id, customer_name, case_key, painter_reminder_sent_at, cars(license_plate)')
    .in('id', doneCaseIds)
    .is('closed_at', null)
    .is('painter_entered_work_at', null);

  const cutoff = Date.now() - REMINDER_INTERVAL_MS;
  const due = ((candidateCases ?? []) as Array<{
    id: string; branch_id: string; customer_name: string | null; case_key: string | null;
    painter_reminder_sent_at: string | null;
    cars: { license_plate: string | null } | { license_plate: string | null }[] | null;
  }>).filter((c) => !c.painter_reminder_sent_at || new Date(c.painter_reminder_sent_at).getTime() < cutoff);

  let notified = 0;
  for (const c of due) {
    const { data: branchUsers } = await supabase.rpc('branch_recipients' as never, { p_branch: c.branch_id } as never);
    const users = (branchUsers ?? []) as { id: string; role: string; is_bodywork_advisor: boolean | null }[];
    let recipients = users.filter((p) => p.role === 'PAINTER').map((p) => p.id);
    if (recipients.length === 0) {
      recipients = users
        .filter((p) => p.role === 'SERVICE_MANAGER' || p.role === 'SERVICE_ADVISOR' || p.is_bodywork_advisor === true)
        .map((p) => p.id);
    }
    if (recipients.length === 0) continue;

    const car = Array.isArray(c.cars) ? c.cars[0] : c.cars;
    const plate = car?.license_plate ?? c.case_key ?? 'תיק';
    const customer = c.customer_name?.trim() || plate;
    const title = 'תזכורת — רכב ממתין לעבודה';
    const body = `${customer} · ${plate} - עדיין לא סומן כנכנס לעבודה`;

    // Sequential, not Promise.all: concurrent inserts race the DB fan-out
    // trigger's (031/032) 10-second de-dup check against each other, so
    // several can all pass the "not already sent" check before any of their
    // fan-out copies commit — real duplicate notifications to CEOs/
    // cross-branch advisors. Confirmed live: the first run of the escalation
    // loops below (same pattern) sent some overseers 3-4 copies each.
    for (const userId of recipients) {
      const { error: notifErr } = await supabase.from('notifications').insert({
        user_id: userId,
        case_id: c.id,
        type: 'OTHER',
        title,
        body,
        action_url: `/painters/${c.id}`,
      } as never);
      if (notifErr) console.error('[enter-work-reminders] notification insert failed', notifErr);
      await sendPushToUser(userId, { title, body, url: `/painters/${c.id}`, tag: `enter-work-reminder-${c.id}` });
    }

    await supabase.from('cases').update({ painter_reminder_sent_at: new Date().toISOString() } as never).eq('id', c.id);
    notified++;
  }

  return { notified, checked: due.length };
}

/**
 * Item 2 — painter request escalation. A painter's request (`painter_requests`)
 * sitting PENDING (the advisor hasn't even started on it — IN_PROGRESS/DONE
 * both count as "responded") for over an hour gets re-sent to the same
 * advisor audience as the original request (createPainterRequest in
 * app/actions/painter.ts), plus the overseer fan-out. Not gated by work
 * hours — see the file-level doc comment for why.
 */
async function runPainterRequestEscalation(supabase: ServiceClient) {
  const cutoffIso = new Date(Date.now() - ESCALATION_INTERVAL_MS).toISOString();
  const maxAgeIso = new Date(Date.now() - MAX_ESCALATION_AGE_MS).toISOString();

  const { data: pending } = await supabase
    .from('painter_requests')
    .select('id, case_id, description, request_type, created_at, reminder_sent_at')
    .eq('status', 'PENDING')
    .is('reminder_sent_at', null) // one escalation per request, not a repeating nag — see file-level doc
    .lt('created_at', cutoffIso)
    .gt('created_at', maxAgeIso);

  const candidates = (pending ?? []) as Array<{
    id: string; case_id: string; description: string; request_type: string;
    created_at: string; reminder_sent_at: string | null;
  }>;

  let notified = 0;
  for (const r of candidates) {
    const { data: caseData } = await supabase
      .from('cases')
      .select('branch_id, case_key, cars(license_plate)')
      .eq('id', r.case_id)
      .single();
    const c = caseData as { branch_id: string; case_key: string | null; cars: { license_plate: string | null } | { license_plate: string | null }[] | null } | null;
    if (!c) continue;
    const car = Array.isArray(c.cars) ? c.cars[0] : c.cars;
    const plate = car?.license_plate ?? c.case_key ?? 'תיק';

    const { data: branchUsers } = await supabase.rpc('branch_recipients' as never, { p_branch: c.branch_id } as never);
    const users = (branchUsers ?? []) as { id: string; role: string; is_bodywork_advisor: boolean | null }[];
    const advisors = users.filter((p) => p.is_bodywork_advisor === true || p.role === 'SERVICE_MANAGER' || p.role === 'SERVICE_ADVISOR');
    if (advisors.length === 0) continue;

    const typeLabel = r.request_type === 'WORK' ? 'עבודה' : 'חלקים';
    const title = `תזכורת — בקשת פחח ממתינה (${typeLabel})`;
    const body = `רכב ${plate}: ${r.description}`;
    const url = `/go/${r.case_id}?highlight=${r.id}`;

    // Sequential — see the comment on the identical pattern in
    // runEnterWorkReminders above (race against the DB fan-out trigger).
    for (const adv of advisors) {
      const { error: notifErr } = await supabase.from('notifications').insert({
        user_id: adv.id,
        case_id: r.case_id,
        type: 'PAINTER_REQUEST',
        title,
        body,
        action_url: url,
      } as never);
      if (notifErr) console.error('[painter-request-escalation] notification insert failed', notifErr);
      await sendPushToUser(adv.id, { title, body, url, tag: `painter-escalation-${r.id}` });
    }

    const overseers = users.filter((p) => p.role === 'CEO' || p.role === 'SERVICE_ADVISOR');
    await Promise.all(overseers.map((o) => sendPushToUser(o.id, { title, body, url, tag: `painter-escalation-${r.id}` })));

    await supabase.from('painter_requests').update({ reminder_sent_at: new Date().toISOString() } as never).eq('id', r.id);
    notified++;
  }

  return { notified, checked: candidates.length };
}

/**
 * Item 3 — office closure-handoff escalation. A case that's been ready for
 * closure (treatment_finished_at set, closed_at still null) for over an hour,
 * where the original READY_FOR_OFFICE notification is still unread by every
 * OFFICE recipient of that branch, gets a second push. Not gated by work
 * hours — see the file-level doc comment for why.
 */
async function runOfficeClosureEscalation(supabase: ServiceClient) {
  const cutoffIso = new Date(Date.now() - ESCALATION_INTERVAL_MS).toISOString();
  const maxAgeIso = new Date(Date.now() - MAX_ESCALATION_AGE_MS).toISOString();

  const { data: waiting } = await supabase
    .from('cases')
    .select('id, branch_id, case_key, customer_name, office_reminder_sent_at, cars(license_plate)')
    .not('treatment_finished_at', 'is', null)
    .is('closed_at', null)
    .is('office_reminder_sent_at', null) // one escalation per case, not a repeating nag — closure can legitimately take weeks, see file-level doc
    .lt('treatment_finished_at', cutoffIso)
    .gt('treatment_finished_at', maxAgeIso);

  const candidates = (waiting ?? []) as Array<{
    id: string; branch_id: string; case_key: string | null; customer_name: string | null;
    office_reminder_sent_at: string | null;
    cars: { license_plate: string | null } | { license_plate: string | null }[] | null;
  }>;

  let notified = 0;
  for (const c of candidates) {
    // Skip if any OFFICE recipient already read the original notification —
    // "she hasn't opened it" is the actual condition, not just "still open".
    // CAVEAT: this only catches a click through the notification bell — a
    // staffer who navigated to /closure directly (very plausible; that's the
    // normal nav link) never flips `read`, so this check under-detects
    // "already looked at it" more than it over-detects. Not worth solving
    // here — the one-time-only + 48h cap above already bound the downside.
    const { data: readRows } = await supabase
      .from('notifications')
      .select('id, read')
      .eq('case_id', c.id)
      .eq('type', 'READY_FOR_OFFICE');
    const rows = (readRows ?? []) as { id: string; read: boolean }[];
    if (rows.length > 0 && rows.some((n) => n.read)) continue;

    const { data: branchUsers } = await supabase.rpc('branch_recipients' as never, { p_branch: c.branch_id } as never);
    const users = (branchUsers ?? []) as { id: string; role: string; is_bodywork_advisor: boolean | null }[];
    const officeUsers = users.filter((p) => p.role === 'OFFICE');
    if (officeUsers.length === 0) continue;

    const car = Array.isArray(c.cars) ? c.cars[0] : c.cars;
    const plate = car?.license_plate ?? c.case_key ?? 'תיק';
    const customer = c.customer_name?.trim() || plate;
    const title = 'תזכורת — תיק ממתין לתהליך סגירה';
    const body = `${customer} · ${plate} - עדיין לא נפתח`;
    const url = `/closure/${c.id}`;

    // Sequential — see the comment on the identical pattern in
    // runEnterWorkReminders above (race against the DB fan-out trigger).
    for (const ou of officeUsers) {
      const { error: notifErr } = await supabase.from('notifications').insert({
        user_id: ou.id,
        case_id: c.id,
        type: 'READY_FOR_OFFICE',
        title,
        body,
        action_url: url,
      } as never);
      if (notifErr) console.error('[office-closure-escalation] notification insert failed', notifErr);
      await sendPushToUser(ou.id, { title, body, url, tag: `office-escalation-${c.id}` });
    }

    const overseers = users.filter((p) => p.role === 'CEO' || p.role === 'SERVICE_ADVISOR');
    await Promise.all(overseers.map((o) => sendPushToUser(o.id, { title, body, url, tag: `office-escalation-${c.id}` })));

    await supabase.from('cases').update({ office_reminder_sent_at: new Date().toISOString() } as never).eq('id', c.id);
    notified++;
  }

  return { notified, checked: candidates.length };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: 'service client unavailable' }, { status: 500 });

  const { hour, weekday, isoDate } = israelNow();
  const isWeekend = weekday === 5 || weekday === 6; // Fri/Sat
  const isHoliday = EXTRA_CLOSED_DATES.includes(isoDate);
  const inWorkHours = hour >= WORKDAY_START_HOUR && hour < WORKDAY_END_HOUR;

  const enterWork = (isWeekend || isHoliday || !inWorkHours)
    ? { notified: 0, checked: 0, skipped: true as const, reason: isWeekend ? 'weekend' : isHoliday ? 'holiday' : 'outside-work-hours' }
    : await runEnterWorkReminders(supabase);

  const painterRequests = await runPainterRequestEscalation(supabase);
  const officeClosure = await runOfficeClosureEscalation(supabase);

  return NextResponse.json({ ok: true, enterWork, painterRequests, officeClosure });
}
