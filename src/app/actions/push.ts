'use server';

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
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

let vapidConfigured = false;
function configureVapid() {
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

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function isSchemaCacheError(msg: string | undefined): boolean {
  if (!msg) return false;
  return msg.includes('schema cache') || msg.includes('PGRST202') || msg.includes('PGRST205');
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function savePushSubscription(sub: PushSubscriptionPayload, userAgent?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  // PRIMARY PATH: direct fetch to the Edge Function that bypasses PostgREST
  // entirely. Using raw fetch instead of supabase.functions.invoke() because
  // the server-side @supabase/ssr client doesn't always pass the user JWT
  // through the invoke wrapper correctly.
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (accessToken && supabaseUrl && anonKey) {
      const res = await fetch(`${supabaseUrl}/functions/v1/save-push-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          user_agent: userAgent ?? null,
        }),
        cache: 'no-store',
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.ok) return { ok: true };
      }
      const text = await res.text().catch(() => '');
      console.warn('[savePushSubscription] edge function path failed', res.status, text.slice(0, 200));
    } else {
      console.warn('[savePushSubscription] missing token/url/key for edge function path', {
        hasToken: !!accessToken, hasUrl: !!supabaseUrl, hasKey: !!anonKey,
      });
    }
  } catch (e) {
    console.warn('[savePushSubscription] edge function threw, falling back', e);
  }

  // FALLBACK PATHS (only used if Edge Function path failed). Same staircase
  // as before: RPC → direct upsert → raw fetch with Accept-Profile.
  const row = {
    user_id: user.id,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: userAgent ?? null,
    last_used_at: new Date().toISOString(),
  };

  let lastError: string | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    {
      const { error } = await supabase.rpc('save_push_subscription' as never, {
        p_endpoint: sub.endpoint,
        p_p256dh: sub.keys.p256dh,
        p_auth: sub.keys.auth,
        p_user_agent: userAgent ?? null,
      } as never);
      if (!error) return { ok: true };
      lastError = error.message;
      if (!isSchemaCacheError(error.message)) {
        console.warn('[savePushSubscription] rpc failed (non-cache)', error);
      }
    }
    {
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(row as never, { onConflict: 'endpoint' });
      if (!error) return { ok: true };
      lastError = error.message;
    }
    await sleep(400 + attempt * 400);
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (supabaseUrl && anonKey && accessToken) {
      const res = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
          'Accept-Profile': 'public',
        },
        body: JSON.stringify(row),
      });
      if (res.ok || res.status === 201) return { ok: true };
      const text = await res.text();
      lastError = `${res.status}: ${text.slice(0, 200)}`;
    }
  } catch (e) {
    console.error('[savePushSubscription] raw fetch threw', e);
  }

  return { error: lastError ?? 'שמירה נכשלה ולא ידוע מדוע' };
}

export async function removePushSubscription(endpoint: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  // Try RPC then fall back to direct delete.
  {
    const { error } = await supabase.rpc('remove_push_subscription' as never, {
      p_endpoint: endpoint,
    } as never);
    if (!error) return { ok: true };
    if (!isSchemaCacheError(error.message)) {
      return { error: error.message };
    }
  }
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id);
  if (error) return { error: error.message };
  return { ok: true };
}

/** CEO-callable: send a test push to the current user. Returns a diagnostic string. */
export async function sendTestPushToSelf(): Promise<{ ok?: boolean; error?: string; diagnostic?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  configureVapid();
  if (!vapidConfigured) {
    return { error: 'VAPID לא מוגדר בשרת', diagnostic: `pub:${!!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}, priv:${!!process.env.VAPID_PRIVATE_KEY}, sub:${!!process.env.VAPID_SUBJECT}` };
  }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user.id);

  if (!subs || subs.length === 0) {
    return { error: 'אין הרשמת push פעילה - לחץ על "הפעל התראות" בפעמון תחילה' };
  }

  const result = await sendPushToUser(user.id, {
    title: '✅ Push test',
    body: 'אם הודעה זו הגיעה לטלפון שלך - הכל עובד.',
    url: '/notifications',
    tag: 'test-push',
  });

  return {
    ok: result.sent > 0,
    diagnostic: `subs:${subs.length}, sent:${result.sent}, failed:${result.failed}`,
  };
}

/**
 * Send a web push to every active subscription of the given user.
 * Best-effort: failures are logged but don't throw, since this is called
 * inline from notification-creating server actions.
 */
export async function sendPushToUser(userId: string, payload: { title: string; body?: string; url?: string; tag?: string }) {
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

  await Promise.all(
    (subs as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>).map(async (s) => {
      const trySend = () =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          // urgency:'high' → Apple's relay sets apns-priority 10 = "deliver
          // immediately and trigger a user-visible alert" (banner/lock screen).
          // The web-push default is 'normal', which can be delivered quietly.
          { TTL: 60 * 60 * 24, urgency: 'high' }
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
          console.warn('[push] send failed after retry', { endpoint: s.endpoint.slice(0, 60), status, err: (err2 as Error)?.message });
        }
      }
    })
  );

  if (expired.length > 0) {
    await db.from('push_subscriptions').delete().in('id', expired);
  }

  console.log('[push] sendPushToUser done for', userId, '— sent:', sent, 'failed:', failed);
  return { sent, failed };
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
 */
export async function pushToOverseers(
  payload: { title: string; body?: string; url?: string; tag?: string },
  excludeUserId?: string
) {
  const db = getServiceClient() ?? (await createClient());
  const { data: overseers } = await db
    .from('profiles')
    .select('id')
    .in('role', ['CEO', 'SERVICE_ADVISOR'])
    .eq('is_active', true);
  const targets = ((overseers ?? []) as { id: string }[]).filter((o) => o.id !== excludeUserId);
  // Awaited (not fire-and-forget): on Vercel's serverless runtime, a promise
  // left running after the server action returns can get frozen/killed before
  // it ever sends — the same "huge delay" bug this file's docs already warn
  // about for sendPushToUser. Parallelized across recipients so N overseers
  // doesn't mean N sequential round-trips.
  await Promise.all(targets.map((o) => sendPushToUser(o.id, payload)));
}
