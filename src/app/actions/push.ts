'use server';

import { createClient } from '@/lib/supabase/server';
import webpush from 'web-push';

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

  // PRIMARY PATH: Supabase Edge Function `save-push-subscription` talks to
  // Postgres directly (via deno-postgres), bypassing PostgREST entirely. This
  // sidesteps the PGRST205 "schema cache" issue that kept biting us — different
  // replicas had stale state and the cache never propagated reliably.
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (accessToken) {
      const { data, error } = await supabase.functions.invoke('save-push-subscription', {
        body: {
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          user_agent: userAgent ?? null,
        },
      });
      const fn = data as { ok?: boolean; error?: string } | null;
      if (!error && fn?.ok) return { ok: true };
      console.warn('[savePushSubscription] edge function path failed, falling back', { error, data });
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
    return { error: 'אין הרשמת push פעילה — לחץ על "הפעל התראות" בפעמון תחילה' };
  }

  const result = await sendPushToUser(user.id, {
    title: '✅ Push test',
    body: 'אם הודעה זו הגיעה לטלפון שלך — הכל עובד.',
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

  const supabase = await createClient();
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (!subs || subs.length === 0) return { sent: 0, failed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const expired: string[] = [];

  await Promise.all(
    (subs as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 24 }
        );
        sent++;
        console.log('[push] sent ok to', s.endpoint.slice(0, 60));
      } catch (err: unknown) {
        failed++;
        const status = (err as { statusCode?: number } | null)?.statusCode;
        // 404/410 = subscription is gone for good; clean it up
        if (status === 404 || status === 410) {
          expired.push(s.id);
          console.warn('[push] removing expired sub', s.endpoint.slice(0, 60));
        } else {
          console.warn('[push] send failed', { endpoint: s.endpoint.slice(0, 60), status, err: (err as Error)?.message });
        }
      }
    })
  );

  if (expired.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', expired);
  }

  console.log('[push] sendPushToUser done for', userId, '— sent:', sent, 'failed:', failed);
  return { sent, failed };
}
