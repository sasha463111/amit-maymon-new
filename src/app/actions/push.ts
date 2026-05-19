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

export async function savePushSubscription(sub: PushSubscriptionPayload, userAgent?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  // Upsert by endpoint (a re-subscribe should refresh keys, not error out)
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: userAgent ?? null,
        last_used_at: new Date().toISOString(),
      } as never,
      { onConflict: 'endpoint' }
    );

  if (error) return { error: error.message };
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

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
