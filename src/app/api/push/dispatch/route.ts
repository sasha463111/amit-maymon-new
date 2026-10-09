import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendPushToUser } from '@/app/actions/push';
import { DAILY_EMAIL_LIMIT, sendNotificationEmail } from '@/lib/notificationEmail';

// Push — and an email copy, up to 50 a day — for EVERY notification a CEO
// receives (requested by Amit, 2026-10-06).
//
// Why this is driven from the database and not from app code: most CEO
// notifications are copies made by the DB fan-out trigger (migration 031),
// and the cron reminders insert rows directly — app code never sees those
// rows, so it cannot push them. A trigger on notifications (dispatch_ceo_push)
// calls this route for each new CEO row instead, so every row gets a push no
// matter which code path created it, including ones added later.
//
// Auth: the trigger sends a secret that exists only in Supabase Vault; this
// route verifies it via check_push_dispatch_secret(). It is never in code,
// env vars or logs.
//
// Idempotent: the row is claimed by setting pushed_at, so a retry or a
// duplicate call can never push the same notification twice.

export const dynamic = 'force-dynamic';

const EMAIL_TYPES = new Set(['PENDING_APPROVAL', 'CEO_REJECTED', 'DIRECT_NOTE']);

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: Request) {
  const db = getServiceClient();
  if (!db) return NextResponse.json({ error: 'service client unavailable' }, { status: 500 });

  const secret = req.headers.get('x-dispatch-secret') ?? '';
  const { data: valid, error: secretErr } = await db.rpc('check_push_dispatch_secret' as never, { p_secret: secret } as never);
  if (secretErr || valid !== true) {
    // The reason and the database this server points at are returned on
    // purpose: the same code runs on more than one Vercel project, with
    // different env, and this response (stored by pg_net) is the only way to
    // see which one is misconfigured. Neither reveals the secret: a wrong
    // guess gets "mismatch", same as before.
    let db = 'unknown';
    try { db = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname.split('.')[0]; } catch { /* keep 'unknown' */ }
    return NextResponse.json(
      { error: 'unauthorized', reason: secretErr ? `rpc-error: ${secretErr.message.slice(0, 120)}` : 'mismatch', db },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  // Claim the row: only the first call for an unpushed notification wins.
  const { data: claimed, error: claimErr } = await db
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() } as never)
    .eq('id', id)
    .is('pushed_at' as never, null)
    .select('user_id, title, body, action_url, case_id, type');
  if (claimErr) {
    console.error('[push/dispatch] claim failed', { id, error: claimErr.message });
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }
  const row = (claimed as { user_id: string; title: string; body: string | null; action_url: string | null; case_id: string | null; type: string | null }[] | null)?.[0];
  if (!row) return NextResponse.json({ ok: true, skipped: 'already pushed or not found' });

  const url = row.action_url || (row.case_id ? `/go/${row.case_id}` : '/notifications');
  const result = await sendPushToUser(
    row.user_id,
    { title: row.title, body: row.body ?? '', url, tag: `n-${id}` },
    { direct: true },
  );
  console.log('[push/dispatch]', { id, user: row.user_id, ...result });

  // Email copy, capped per day. claim_notification_email() decides: it
  // returns nothing when the recipient has email off, the cap is used up, or
  // this row was already emailed.
  let email: string = 'skipped';
  // Email only what needs the reader to act (Amit, 2026-10-09, "3ב"):
  // approvals waiting, rejections, and notes/questions sent to him. Plain
  // updates still come as push and in the app. He hit the 50-a-day cap on
  // 07.10 with mostly "new case opened" / "entered work" updates.
  if (!EMAIL_TYPES.has(row.type ?? '')) {
    return NextResponse.json({ ok: true, ...result, email: 'not-actionable' });
  }
  const { data: slotRows, error: slotErr } = await db.rpc(
    'claim_notification_email' as never,
    { p_notification_id: id, p_daily_limit: DAILY_EMAIL_LIMIT } as never,
  );
  if (slotErr) {
    console.error('[push/dispatch] email claim failed', { id, error: slotErr.message });
    email = 'claim-error';
  } else {
    const claim = (slotRows as { slot: number; email: string }[] | null)?.[0];
    if (claim) {
      // Car number and customer for the subject line, so the inbox alone
      // says which car it is about without opening the email (Amit,
      // 2026-10-07). Best-effort: a failed lookup just sends without them.
      let plate: string | null = null;
      let customer: string | null = null;
      if (row.case_id) {
        const { data: caseInfo } = await db
          .from('cases')
          .select('customer_name, cars(license_plate)')
          .eq('id', row.case_id)
          .maybeSingle();
        const ci = caseInfo as { customer_name: string | null; cars: { license_plate: string | null } | { license_plate: string | null }[] | null } | null;
        const car = Array.isArray(ci?.cars) ? ci?.cars[0] : ci?.cars;
        plate = car?.license_plate ?? null;
        customer = ci?.customer_name ?? null;
      }
      const sent = await sendNotificationEmail({
        to: claim.email,
        title: row.title,
        plate,
        customer,
        body: row.body ?? '',
        link: new URL(url, new URL(req.url).origin).toString(),
        slot: claim.slot,
      });
      if (sent.ok) {
        email = `sent ${claim.slot}/${DAILY_EMAIL_LIMIT}`;
      } else {
        // Give the slot back so a failed send doesn't eat the daily quota.
        await db.rpc('release_notification_email' as never, { p_notification_id: id } as never);
        console.error('[push/dispatch] email send failed', { id, error: sent.error });
        email = 'send-failed';
      }
    }
  }

  return NextResponse.json({ ok: true, ...result, email });
}
