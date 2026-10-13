// Server-side push sending (moved out of the 'use server' module
// src/app/actions/push.ts on 2026-10-13). Every export of a 'use server'
// file is a publicly callable endpoint, so sendPushToUser(…, {direct:true})
// let anyone push any text and link to any employee. Only server code
// (the dispatcher route, the self-test action, other actions) imports this.

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
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
  const db = getServiceClient() ?? (await createClient());
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

/**
 * Push a notification to every active CEO and SERVICE_ADVISOR — the "overseers"
 * who must be alerted about everything — except the user who triggered it.
 *
 * The in-app copies for these roles are created by the DB fan-out trigger
 * (migration 031), but that trigger cannot send web push. This is the push side
 * of that same guarantee, so the CEO and the service advisor get a push for
 * every event, not just the ones their role is the direct target of. Reads the
 * overseer list with the service client (bypasses RLS). Fire-and-forget.
 *
 * DEPRECATED: Use notifyRelevantParties() instead for role-based + branch-filtered routing.
 */
export async function pushToOverseers(
  payload: { title: string; body?: string; url?: string; tag?: string },
  excludeUserId?: string
) {
  const db = getServiceClient() ?? (await createClient());
  const { data: overseers } = await db
    .from('profiles')
    .select('id, role')
    .in('role', ['CEO', 'SERVICE_ADVISOR'])
    .eq('is_active', true);
  // CEOs get pushed for every event, including ones they triggered
  // themselves, so their notifications feed works as a full activity/audit
  // trail (explicit request — "שאוכל לעקוב"). Only non-CEO overseers are
  // still excluded when they're also the actor. Mirrors the DB fan-out
  // trigger change in migration 041.
  const targets = ((overseers ?? []) as { id: string; role: string }[]).filter(
    (o) => o.role === 'CEO' || o.id !== excludeUserId
  );
  // Awaited (not fire-and-forget): on Vercel's serverless runtime, a promise
  // left running after the server action returns can get frozen/killed before
  // it ever sends — the same "huge delay" bug this file's docs already warn
  // about for sendPushToUser. Parallelized across recipients so N overseers
  // doesn't mean N sequential round-trips.
  await Promise.all(targets.map((o) => sendPushToUser(o.id, payload)));
}

/**
 * Smart notification router: sends push notifications ONLY to relevant parties
 * based on action type and branch context. Ensures:
 *
 * 1. Role-based filtering — only recipients relevant to the action type get alerted
 * 2. Branch filtering — staff outside the case's branch don't get notified
 * 3. Audit trail — CEOs always receive notifications for full visibility
 * 4. Exclusion — the actor is excluded unless they're a CEO (whose feed is an audit log)
 *
 * Action Type Routing Table:
 * - PENDING_APPROVAL: CEO (all branches)
 * - NEW_CASE: SERVICE_MANAGER (same branch)
 * - ENTER_WORK: SERVICE_ADVISOR + PAINTER (same branch)
 * - WASH_COMPLETE: SERVICE_ADVISOR (same branch)
 * - READY_FOR_OFFICE: OFFICE (same branch)
 * - CASE_CLOSED: OFFICE + SERVICE_MANAGER (same branch)
 * - PAINTER_REQUEST: SERVICE_ADVISOR + PAINTER (same branch)
 * - PARTS_ARRIVED: PAINTER (same branch)
 * - APPROVAL_REJECTED: SERVICE_MANAGER (same branch)
 * - APPROVAL_APPROVED: SERVICE_MANAGER (same branch)
 * - EXTRA_CREATED: SERVICE_MANAGER (same branch)
 * - COMPLETION_PHOTOS: SERVICE_ADVISOR (same branch)
 */
export type NotificationActionType =
  | 'PENDING_APPROVAL'
  | 'NEW_CASE'
  | 'ENTER_WORK'
  | 'WASH_COMPLETE'
  | 'READY_FOR_OFFICE'
  | 'CASE_CLOSED'
  | 'PAINTER_REQUEST'
  | 'PARTS_ARRIVED'
  | 'APPROVAL_REJECTED'
  | 'APPROVAL_APPROVED'
  | 'EXTRA_CREATED'
  | 'COMPLETION_PHOTOS';

interface NotificationRoutingConfig {
  roles: string[];
  includeCeo: boolean; // if true, always send to CEO for audit trail
}

const NOTIFICATION_ROUTING: Record<NotificationActionType, NotificationRoutingConfig> = {
  PENDING_APPROVAL: { roles: ['CEO'], includeCeo: false },
  NEW_CASE: { roles: ['SERVICE_MANAGER'], includeCeo: true },
  ENTER_WORK: { roles: ['SERVICE_ADVISOR', 'PAINTER'], includeCeo: true },
  WASH_COMPLETE: { roles: ['SERVICE_ADVISOR'], includeCeo: true },
  READY_FOR_OFFICE: { roles: ['OFFICE'], includeCeo: true },
  CASE_CLOSED: { roles: ['OFFICE', 'SERVICE_MANAGER'], includeCeo: true },
  PAINTER_REQUEST: { roles: ['SERVICE_ADVISOR', 'PAINTER'], includeCeo: true },
  PARTS_ARRIVED: { roles: ['PAINTER'], includeCeo: true },
  APPROVAL_REJECTED: { roles: ['SERVICE_MANAGER'], includeCeo: true },
  APPROVAL_APPROVED: { roles: ['SERVICE_MANAGER'], includeCeo: true },
  EXTRA_CREATED: { roles: ['SERVICE_MANAGER'], includeCeo: true },
  COMPLETION_PHOTOS: { roles: ['SERVICE_ADVISOR'], includeCeo: true },
};

/**
 * Send push notifications only to relevant parties based on action type.
 * Implements the smart routing table above.
 *
 * @param actionType The type of action that triggered the notification
 * @param branchId The branch context (for filtering recipients)
 * @param payload The push notification content
 * @param excludeUserId The user who triggered the action (excluded unless CEO)
 * @param branchRecipients Optional pre-fetched list of branch recipients to avoid extra queries
 */
export async function notifyRelevantParties(
  actionType: NotificationActionType,
  branchId: string | null | undefined,
  payload: { title: string; body?: string; url?: string; tag?: string },
  excludeUserId?: string,
  branchRecipients?: { id: string; role: string; is_bodywork_advisor?: boolean | null }[]
) {
  const config = NOTIFICATION_ROUTING[actionType];
  if (!config) {
    console.warn('[notifyRelevantParties] unknown action type:', actionType);
    return;
  }

  const db = getServiceClient() ?? (await createClient());

  // Determine target roles
  let targetRoles = [...config.roles];
  if (config.includeCeo && !targetRoles.includes('CEO')) {
    targetRoles.push('CEO');
  }

  // Fetch recipients
  let recipients: { id: string; role: string }[] = [];

  if (config.includeCeo && targetRoles.includes('CEO')) {
    // For CEO (audit trail) + branch-specific roles: fetch both
    const { data: ceos } = await db
      .from('profiles')
      .select('id, role')
      .eq('role', 'CEO')
      .eq('is_active', true);
    recipients.push(...((ceos ?? []) as { id: string; role: string }[]));

    // Fetch branch-specific roles
    const nonCeoRoles = targetRoles.filter((r) => r !== 'CEO');
    if (nonCeoRoles.length > 0 && branchId) {
      // Use branchRecipients parameter if provided, otherwise fetch from DB
      if (branchRecipients && branchRecipients.length > 0) {
        recipients.push(
          ...branchRecipients
            .filter((r) => nonCeoRoles.includes(r.role))
            .map((r) => ({ id: r.id, role: r.role }))
        );
      } else {
        // Fallback: fetch branch recipients via RPC
        const { data: branchStaff } = await db.rpc('branch_recipients' as never, { p_branch: branchId } as never);
        recipients.push(
          ...(((branchStaff ?? []) as { id: string; role: string }[]).filter((r) =>
            nonCeoRoles.includes(r.role)
          ))
        );
      }
    }
  } else if (branchId) {
    // Branch-scoped notification only (no CEO included)
    if (branchRecipients && branchRecipients.length > 0) {
      recipients.push(
        ...branchRecipients
          .filter((r) => targetRoles.includes(r.role))
          .map((r) => ({ id: r.id, role: r.role }))
      );
    } else {
      const { data: branchStaff } = await db.rpc('branch_recipients' as never, { p_branch: branchId } as never);
      recipients.push(
        ...(((branchStaff ?? []) as { id: string; role: string }[]).filter((r) =>
          targetRoles.includes(r.role)
        ))
      );
    }
  }

  // Filter out the actor (except CEOs, whose feed is an audit trail)
  const targets = recipients.filter((r) => r.role === 'CEO' || r.id !== excludeUserId);

  // Remove duplicates by ID
  const uniqueTargets = Array.from(new Map(targets.map((t) => [t.id, t])).values());

  // Send push to all targets in parallel
  await Promise.all(uniqueTargets.map((t) => sendPushToUser(t.id, payload)));
}
