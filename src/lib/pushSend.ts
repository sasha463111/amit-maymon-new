import 'server-only';

// Server-side push sending (moved out of the 'use server' module
// src/app/actions/push.ts on 2026-10-13). Every export of a 'use server'
// file is a publicly callable endpoint, so sendPushToUser(…, {direct:true})
// let anyone push any text and link to any employee. Only server code
// (the dispatcher route, the self-test action, other actions) imports this.

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import webpush from 'web-push';

/**
 * A server-only Supabase client keyed with the service-role secret. It bypasses
 * RLS — which is required to READ another user's push subscriptions.
 *
 * Why this is necessary: push_subscriptions RLS is `user_id = auth.uid() OR CEO`.
 * When a non-CEO actor (a painter opening a request, a manager completing WASH)
 * triggers a push to someone else, the RLS-bound client sees ZERO of the
 * recipient's subscriptions, so no push is ever delivered — the recipient only
 * notices when they next open the app. That was the "huge delay" in the field.
 *
 * The service key lives only in server env (Vercel), never NEXT_PUBLIC, so it is
 * never shipped to the browser. Falls back to null if unset (older/local envs),
 * in which case callers degrade to the RLS client.
 */
export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

let vapidConfigured = false;
export function isVapidConfigured(): boolean {
  configureVapid();
  return vapidConfigured;
}
export function configureVapid() {
  if (vapidConfigured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@tehila-bodyshop.example';
  if (!pub || !priv) {
    console.warn('[push] VAPID keys missing — push send disabled');
    return;
  }
  webpush.setVapidDetails(subject, pub, priv);
  vapidConfigured = true;
}

export function isSchemaCacheError(msg: string | undefined): boolean {
  if (!msg) return false;
  return msg.includes('schema cache') || msg.includes('PGRST202') || msg.includes('PGRST205');
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}


/**
 * Send a web push to every active subscription of the given user.
 * Best-effort: failures are logged but don't throw, since this is called
 * inline from notification-creating server actions.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body?: string; url?: string; tag?: string },
  // EVERYONE is pushed ONLY by /api/push/dispatch, which trg_dispatch_ceo_push
  // calls once per notification row (migration 20261011140000; until then it
  // was CEOs only). So a push exists exactly when a notification row exists —
  // and a row exists only if it is relevant to the person's job
  // (notification_is_relevant). Every other caller is a no-op here, centrally:
  // the old inline pushes reached people who had no row at all (Amit,
  // 2026-10-11: "everyone gets the same notifications"). `direct` is for the
  // dispatcher and the self-test only.
  opts?: { direct?: boolean },
) {
  if (!opts?.direct) return { sent: 0, failed: 0 };
  configureVapid();
  if (!vapidConfigured) return { sent: 0, failed: 0 };

  // Read subscriptions with the service-role client so we can see the
  // RECIPIENT's subscriptions even when the acting user isn't them (and isn't a
  // CEO). Falls back to the RLS client only if the service key is missing.
  const db = (getServiceClient() ?? (await createClient())) as unknown as SupabaseClient<Database>;
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (!subs || subs.length === 0) {
    console.log('[push] no subscriptions for', userId);
    return { sent: 0, failed: 0 };
  }

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const expired: string[] = [];
  // Why sends failed, returned to the caller. /api/push/dispatch puts it in
  // its response, which pg_net stores in net._http_response — the only place
  // failures are visible without access to the Vercel logs.
  const errors: { host: string; status: number | null; message: string }[] = [];

  await Promise.all(
    (subs as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>).map(async (s) => {
      const trySend = () =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          // urgency:'high' → Apple's relay sets apns-priority 10 = "deliver
          // immediately and trigger a user-visible alert" (banner/lock screen).
          // The web-push default is 'normal', which can be delivered quietly.
          // timeout: a push service that never answers must not hold the
          // caller's server action open. Without it, creating a case waited
          // on every push in turn and one stalled request left the creator
          // on "יוצר תיק..." indefinitely (2026-10-08).
          { TTL: 60 * 60 * 24, urgency: 'high', timeout: 8000 }
        );
      try {
        await trySend();
        sent++;
        console.log('[push] sent ok to', s.endpoint.slice(0, 60));
      } catch (err: unknown) {
        const status = (err as { statusCode?: number } | null)?.statusCode;
        // 404/410 = subscription is gone for good; clean it up, no retry.
        if (status === 404 || status === 410) {
          failed++;
          expired.push(s.id);
          console.warn('[push] removing expired sub', s.endpoint.slice(0, 60));
          return;
        }
        // 403 because the subscription was created with a different VAPID
        // key (the legacy deployments, before 2026-10-07). It can never be
        // delivered from here, so remove it instead of retrying it on every
        // notification. Safe since the official deployment's key pair is
        // verified good: the same user's fresh subscription receives (sent:1).
        const firstBody = String((err as { body?: string } | null)?.body ?? '');
        if (status === 403 && /BadJwtToken|do not correspond/i.test(firstBody)) {
          failed++;
          expired.push(s.id);
          console.warn('[push] removing sub made with another VAPID key', s.endpoint.slice(0, 60));
          return;
        }
        // Anything else (5xx from the push service, network blip) is
        // transient — one retry after a short delay catches those instead
        // of just losing the notification silently.
        await sleep(600);
        try {
          await trySend();
          sent++;
          console.log('[push] sent ok on retry to', s.endpoint.slice(0, 60));
        } catch (err2: unknown) {
          failed++;
          const status2 = (err2 as { statusCode?: number } | null)?.statusCode ?? status ?? null;
          const resBody = (err2 as { body?: string } | null)?.body;
          let host = 'unknown';
          try { host = new URL(s.endpoint).host; } catch { /* keep 'unknown' */ }
          errors.push({ host, status: status2, message: String(resBody || (err2 as Error)?.message || '').slice(0, 160) });
          console.warn('[push] send failed after retry', { endpoint: s.endpoint.slice(0, 60), status, err: (err2 as Error)?.message });
        }
      }
    })
  );

  if (expired.length > 0) {
    await db.from('push_subscriptions').delete().in('id', expired);
  }

  console.log('[push] sendPushToUser done for', userId, '— sent:', sent, 'failed:', failed);
  return { sent, failed, errors };
}

// pushToOverseers / notifyRelevantParties were removed 2026-10-13: every
// push now comes from the DB dispatcher per notification row, so they only
// ran recipient queries and then called a no-op.
