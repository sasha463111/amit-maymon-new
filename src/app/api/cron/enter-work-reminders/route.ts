import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendPushToUser } from '@/app/actions/push';

/**
 * "כניסה לעבודה" reminder — re-notifies painters about cars that entered
 * work but nobody's acknowledged (painter_entered_work_at still null),
 * roughly every 2 hours during the work day, until the car's status changes.
 *
 * WHY THIS IS A PLAIN API ROUTE, NOT A VERCEL CRON JOB: Vercel's Hobby plan
 * only allows a daily cron trigger — nowhere near the ~2h cadence this needs.
 * Instead this is meant to be pinged externally on a real schedule (see
 * .github/workflows/enter-work-reminders.yml, which runs every 30 min via
 * GitHub Actions — free, and not tied to any Vercel plan tier).
 *
 * WHY EVERY 30 MIN INSTEAD OF EVERY 2H: precision isn't needed here — the
 * route is idempotent (painter_reminder_sent_at gates re-sends), so pinging
 * more often just means the actual ~2h interval self-corrects instead of
 * depending on an external scheduler landing exactly on the hour. It also
 * means a late/missed external ping doesn't silently skip a whole cycle.
 *
 * HOLIDAYS: only Israeli weekend (Fri/Sat) is handled programmatically.
 * Jewish holiday dates need to be hand-maintained in EXTRA_CLOSED_DATES
 * below — there's no reliable way to compute the Hebrew calendar here
 * without a library this project doesn't have, and guessing wrong dates is
 * worse than leaving it to be filled in.
 */

const REMINDER_INTERVAL_MS = 110 * 60 * 1000; // ~110 min: under 2h so drift never skips a cycle
const WORKDAY_START_HOUR = 9;
const WORKDAY_END_HOUR = 17;

// Extra closed dates beyond Fri/Sat (Israeli holidays, chol hamoed, etc.) —
// 'YYYY-MM-DD' in Israel local time. Empty until filled in; add as needed.
const EXTRA_CLOSED_DATES: string[] = [
  // '2026-09-13', // example: Rosh Hashanah eve
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

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { hour, weekday, isoDate } = israelNow();
  const isWeekend = weekday === 5 || weekday === 6; // Fri/Sat
  const isHoliday = EXTRA_CLOSED_DATES.includes(isoDate);
  const inWorkHours = hour >= WORKDAY_START_HOUR && hour < WORKDAY_END_HOUR;

  if (isWeekend || isHoliday || !inWorkHours) {
    return NextResponse.json({ ok: true, skipped: true, reason: isWeekend ? 'weekend' : isHoliday ? 'holiday' : 'outside-work-hours' });
  }

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: 'service client unavailable' }, { status: 500 });

  // Candidates: ENTER_WORK is DONE (painters were already notified once) but
  // painter_entered_work_at is still null (nobody's acknowledged) — "until
  // the car changes status" per the request.
  const { data: activeRuns } = await supabase
    .from('case_workflow_runs')
    .select('id, case_id')
    .eq('workflow_type', 'PROFESSIONAL')
    .eq('status', 'ACTIVE');
  const runs = (activeRuns ?? []) as { id: string; case_id: string }[];
  if (runs.length === 0) return NextResponse.json({ ok: true, notified: 0 });

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
  if (doneCaseIds.length === 0) return NextResponse.json({ ok: true, notified: 0 });

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

    await Promise.all(
      recipients.map(async (userId) => {
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
      })
    );

    await supabase.from('cases').update({ painter_reminder_sent_at: new Date().toISOString() } as never).eq('id', c.id);
    notified++;
  }

  return NextResponse.json({ ok: true, notified, checked: due.length });
}
