import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendPushToUser } from '@/app/actions/push';

// Push for EVERY notification a CEO receives (requested by Amit, 2026-10-06).
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
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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
    .select('user_id, title, body, action_url, case_id');
  if (claimErr) {
    console.error('[push/dispatch] claim failed', { id, error: claimErr.message });
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }
  const row = (claimed as { user_id: string; title: string; body: string | null; action_url: string | null; case_id: string | null }[] | null)?.[0];
  if (!row) return NextResponse.json({ ok: true, skipped: 'already pushed or not found' });

  const url = row.action_url || (row.case_id ? `/go/${row.case_id}` : '/notifications');
  const result = await sendPushToUser(
    row.user_id,
    { title: row.title, body: row.body ?? '', url, tag: `n-${id}` },
    { viaDispatcher: true },
  );
  console.log('[push/dispatch]', { id, user: row.user_id, ...result });
  return NextResponse.json({ ok: true, ...result });
}
