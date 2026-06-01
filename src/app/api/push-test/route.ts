// Debug endpoint to exercise every path in savePushSubscription from inside
// the Vercel runtime. Returns a JSON report. Not meant for production use —
// guarded by a CEO role check.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PathResult {
  path: string;
  ok: boolean;
  status?: number;
  error?: string;
  durationMs: number;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = (profile as { role: string } | null)?.role;
  if (role !== 'CEO') {
    return NextResponse.json({ error: 'ceo_only', role }, { status: 403 });
  }

  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const env = {
    user_id: user.id,
    hasAccessToken: !!accessToken,
    accessTokenLen: accessToken?.length ?? 0,
    hasSupabaseUrl: !!supabaseUrl,
    hasAnonKey: !!anonKey,
    vapidPublic: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    vapidPrivate: !!process.env.VAPID_PRIVATE_KEY,
    vapidSubject: !!process.env.VAPID_SUBJECT,
  };

  const testEndpoint = `https://debug-test/${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const row = {
    user_id: user.id,
    endpoint: testEndpoint,
    p256dh: 'BNotARealKey_debug',
    auth: 'debugauth',
    user_agent: 'push-test-route',
    last_used_at: new Date().toISOString(),
  };

  const results: PathResult[] = [];

  // PATH 1: Edge Function via raw fetch
  {
    const t0 = Date.now();
    try {
      if (!accessToken || !supabaseUrl || !anonKey) {
        results.push({ path: 'edge_function', ok: false, error: 'missing_env_or_token', durationMs: Date.now() - t0 });
      } else {
        const res = await fetch(`${supabaseUrl}/functions/v1/save-push-subscription`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': anonKey,
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            endpoint: testEndpoint + '-edge',
            p256dh: row.p256dh,
            auth: row.auth,
            user_agent: row.user_agent,
          }),
          cache: 'no-store',
        });
        const text = await res.text();
        results.push({
          path: 'edge_function',
          ok: res.ok,
          status: res.status,
          error: res.ok ? undefined : text.slice(0, 300),
          durationMs: Date.now() - t0,
        });
      }
    } catch (e) {
      results.push({ path: 'edge_function', ok: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - t0 });
    }
  }

  // PATH 2: RPC via supabase-js
  {
    const t0 = Date.now();
    try {
      const { error } = await supabase.rpc('save_push_subscription' as never, {
        p_endpoint: testEndpoint + '-rpc',
        p_p256dh: row.p256dh,
        p_auth: row.auth,
        p_user_agent: row.user_agent,
      } as never);
      results.push({ path: 'rpc', ok: !error, error: error?.message, durationMs: Date.now() - t0 });
    } catch (e) {
      results.push({ path: 'rpc', ok: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - t0 });
    }
  }

  // PATH 3: Direct table upsert
  {
    const t0 = Date.now();
    try {
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({ ...row, endpoint: testEndpoint + '-direct' } as never, { onConflict: 'endpoint' });
      results.push({ path: 'direct_upsert', ok: !error, error: error?.message, durationMs: Date.now() - t0 });
    } catch (e) {
      results.push({ path: 'direct_upsert', ok: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - t0 });
    }
  }

  // PATH 4: Raw fetch to PostgREST table
  {
    const t0 = Date.now();
    try {
      if (!accessToken || !supabaseUrl || !anonKey) {
        results.push({ path: 'raw_fetch', ok: false, error: 'missing_env_or_token', durationMs: Date.now() - t0 });
      } else {
        const res = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
          method: 'POST',
          headers: {
            'apikey': anonKey,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
            'Accept-Profile': 'public',
          },
          body: JSON.stringify({ ...row, endpoint: testEndpoint + '-raw' }),
          cache: 'no-store',
        });
        const text = await res.text();
        results.push({
          path: 'raw_fetch',
          ok: res.ok || res.status === 201,
          status: res.status,
          error: (res.ok || res.status === 201) ? undefined : text.slice(0, 300),
          durationMs: Date.now() - t0,
        });
      }
    } catch (e) {
      results.push({ path: 'raw_fetch', ok: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - t0 });
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    env,
    results,
  }, { status: 200 });
}
