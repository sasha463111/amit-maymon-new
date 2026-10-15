'use server';

import { createClient } from '@/lib/supabase/server';
import { getServiceClient, isSchemaCacheError, isVapidConfigured, sendPushToUser, sleep } from '@/lib/pushSend';

// Only what the browser may call: save / remove MY subscription and a test
// push to MYSELF. The sending code lives in src/lib/pushSend.ts — never
// export it from here (every export of a 'use server' file is public).

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function savePushSubscription(sub: PushSubscriptionPayload, userAgent?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  // PRIMARY PATH (15/10, security): write with the service client, with the
  // user id verified above (getUser). The old path went through the Edge
  // Function save-push-subscription, which trusted an x-user-id header and an
  // unverified JWT — anyone could register their own device under another
  // user's id and receive that user's pushes. The function is now retired.
  const admin = getServiceClient();
  if (admin) {
    const { error } = await admin.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: userAgent ?? null,
        last_used_at: new Date().toISOString(),
      } as never,
      { onConflict: 'endpoint' },
    );
    if (!error) return { ok: true };
    console.warn('[savePushSubscription] service upsert failed, falling back', error.message);
  }

  // FALLBACK PATHS (only if the service key is missing or the upsert failed). Same staircase
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

  if (!isVapidConfigured()) {
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
    title: '✅ בדיקת פוש',
    body: 'אם הודעה זו הגיעה לטלפון שלך - הכל עובד.',
    url: '/notifications',
    tag: 'test-push',
  }, { direct: true });

  return {
    ok: result.sent > 0,
    diagnostic: `subs:${subs.length}, sent:${result.sent}, failed:${result.failed}`,
  };
}
