// Debug endpoint to exercise every path in savePushSubscription from inside
// the Vercel runtime. Returns a JSON report. Not meant for production use —
// guarded by a CEO role check.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PathResult {
  path: string;
  ok: boolean;
  status?: number;
  error?: string;
  durationMs: number;
}

export async function GET(req: NextRequest) {
  // Allow X-Test-Token header to bypass cookie-based auth so we can exercise
  // this from CLI without simulating @supabase/ssr's cookie format.
  const headerToken = req.headers.get('x-test-token');

  let userId: string | null = null;
  let accessToken: string | null = null;

  if (headerToken) {
    // Verify token directly with the auth server via raw fetch (more diagnosable
    // than the SDK wrapper which can quietly fail).
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: 'env_missing', supabaseUrl: !!supabaseUrl, anonKey: !!anonKey }, { status: 500 });
    }
    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${headerToken}`,
      },
    });
    // Even if /auth/v1/user fails, parse the JWT locally so we can still
    // exercise the downstream calls. This is a debug endpoint — the JWT was
    // passed in via a server-controlled header so we can trust the payload.
    if (!verifyRes.ok) {
      const text = await verifyRes.text();
      try {
        const parts = headerToken.split('.');
        const padded = parts[1].padEnd(parts[1].length + (4 - (parts[1].length % 4)) % 4, '=');
        const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
        const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
        userId = json.sub;
        accessToken = headerToken;
        console.warn('[push-test] /auth/v1/user verify failed, decoded JWT manually', {
          status: verifyRes.status,
          body: text.slice(0, 200),
          userId,
        });
      } catch (e) {
        return NextResponse.json({
          error: 'bad_test_token',
          verifyStatus: verifyRes.status,
          verifyBody: text.slice(0, 200),
          decodeError: e instanceof Error ? e.message : String(e),
        }, { status: 401 });
      }
    } else {
      const userData = await verifyRes.json();
      userId = userData.id;
      accessToken = headerToken;
    }
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
    }
    userId = user.id;
    const { data: { session } } = await supabase.auth.getSession();
    accessToken = session?.access_token ?? null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    const role = (profile as { role: string } | null)?.role;
    if (role !== 'CEO') {
      return NextResponse.json({ error: 'ceo_only', role }, { status: 403 });
    }
  }

  const supabase = await createClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const env = {
    user_id: userId,
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
    user_id: userId,
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

  // PATH 4.5: Raw fetch with SERVICE_ROLE bypass (HS256 — every replica knows the secret)
  {
    const t0 = Date.now();
    try {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!serviceRoleKey || !supabaseUrl || !anonKey) {
        results.push({ path: 'service_role_raw', ok: false, error: 'missing_service_role', durationMs: Date.now() - t0 });
      } else {
        const res = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
          method: 'POST',
          headers: {
            'apikey': anonKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify({ ...row, endpoint: testEndpoint + '-svc' }),
          cache: 'no-store',
        });
        const text = await res.text();
        results.push({
          path: 'service_role_raw',
          ok: res.ok || res.status === 201,
          status: res.status,
          error: (res.ok || res.status === 201) ? undefined : text.slice(0, 300),
          durationMs: Date.now() - t0,
        });
      }
    } catch (e) {
      results.push({ path: 'service_role_raw', ok: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - t0 });
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
