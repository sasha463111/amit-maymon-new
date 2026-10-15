'use server';

import { createHash } from 'crypto';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// #43 (15/10): in-house error monitoring. The browser reports every error a
// user hits (error boundaries + unhandled errors, see ErrorReporter) → one
// app_errors row per distinct error, with a counter. The first time an error
// is seen by a signed-in user, a BUG ticket opens on /bugs and the developer
// gets a push; if that ticket was closed and the error comes back, it reopens.
// This export is public (every 'use server' export is): inputs are trimmed,
// anonymous reports are only counted, and auto-tickets are capped per day.

const MAX_TICKETS_PER_DAY = 10;

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
/** Same error on another record = same error: ids and numbers out of the path / message. */
const normPath = (p: string) => p.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id').replace(/\/\d+(?=\/|$)/g, '/:n').split('?')[0];
const normMsg = (m: string) => m.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id').replace(/\d+/g, '#').slice(0, 200);

export type ClientError = { source: 'boundary' | 'window' | 'promise'; message: string; digest?: string; path: string; stack?: string };

export async function reportClientError(e: ClientError): Promise<void> {
  try {
    const db = service();
    if (!db) return;
    const source = e?.source === 'window' || e?.source === 'promise' ? e.source : 'boundary';
    const message = cut(e?.message, 1000) || '(ללא הודעה)';
    const digest = cut(e?.digest, 64) || null;
    const path = normPath(cut(e?.path, 300) || '/');
    const stack = cut(e?.stack, 4000) || null;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = user ? await db.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle() : { data: null };
    const p = prof as { full_name: string | null; role: string } | null;

    // A server-side error reaches the browser as a generic message + digest, so the digest is the identity.
    const fingerprint = createHash('sha256').update(digest ? `digest|${digest}` : `${source}|${path}|${normMsg(message)}`).digest('hex').slice(0, 40);
    const ua = cut(headers().get('user-agent'), 300) || null;

    const { data: existing } = await db.from('app_errors').select('id, count, users, request_id').eq('fingerprint', fingerprint).maybeSingle();
    const ex = existing as { id: string; count: number; users: string[]; request_id: string | null } | null;
    const now = new Date().toISOString();

    if (ex) {
      const users = user && !ex.users.includes(user.id) ? [...ex.users, user.id].slice(-50) : ex.users;
      await db.from('app_errors').update({ count: ex.count + 1, last_seen: now, last_user: user?.id ?? null, users } as never).eq('id', ex.id);
      // The ticket was closed but the error is back → reopen it (once per return).
      if (ex.request_id && user) {
        const { data: t } = await db.from('app_requests').select('status').eq('id', ex.request_id).maybeSingle();
        if ((t as { status: string } | null)?.status === 'DONE') {
          await db.from('app_requests').update({ status: 'NEW', updated_at: now } as never).eq('id', ex.request_id);
          await db.from('app_request_messages').insert({ request_id: ex.request_id, body: `🔁 השגיאה חזרה אחרי שהטיקט נסגר (${p?.full_name ?? 'משתמש'}, ${path}). סה"כ ${ex.count + 1} פעמים.` } as never);
        }
      }
      return;
    }

    // Anonymous (public pages / signed out): counted, but new rows are capped per hour.
    if (!user) {
      const { count: anon } = await db.from('app_errors').select('id', { count: 'exact', head: true }).is('first_user', null).gte('first_seen', new Date(Date.now() - 3600_000).toISOString());
      if ((anon ?? 0) >= 30) return;
    }

    const { data: row } = await db
      .from('app_errors')
      .insert({ fingerprint, source, message, digest, path, stack, user_agent: ua, first_user: user?.id ?? null, last_user: user?.id ?? null, users: user ? [user.id] : [] } as never)
      .select('id')
      .single();
    if (!row || !user) return;

    // Auto-ticket — capped, so an error storm can't flood the board.
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: today } = await db.from('app_errors').select('id', { count: 'exact', head: true }).not('request_id', 'is', null).gte('first_seen', since);
    if ((today ?? 0) >= MAX_TICKETS_PER_DAY) return;

    const { data: devs } = await db.from('profiles').select('id').eq('office_function', 'DEVELOPER').eq('is_active', true);
    const devIds = ((devs ?? []) as { id: string }[]).map((d) => d.id);
    if (!devIds.length) return;

    const body = [
      `🤖 נפתח אוטומטית מניטור השגיאות`,
      `משתמש: ${p?.full_name ?? '?'} (${p?.role ?? '?'})`,
      `מסך: ${path}`,
      `שגיאה: ${message.slice(0, 300)}`,
      digest ? `digest: ${digest} (שגיאת שרת — הפרטים ב-Vercel logs)` : null,
    ]
      .filter(Boolean)
      .join('\n');
    const { data: req } = await db.from('app_requests').insert({ body, kind: 'BUG', priority: 2, created_by: devIds[0] } as never).select('id, ticket_no').single();
    const r = req as { id: string; ticket_no: number } | null;
    if (!r) return;
    await db.from('app_request_messages').insert({ request_id: r.id, body, author_id: devIds[0] } as never);
    await db.from('app_errors').update({ request_id: r.id } as never).eq('id', (row as { id: string }).id);
    await db.from('notifications').insert(
      devIds.map((id) => ({ user_id: id, type: 'DIRECT_NOTE', triggered_by: user.id, title: `🐞 שגיאה חדשה · #${r.ticket_no}`, body: `${path} — ${message.slice(0, 200)}`, action_url: `/bugs#${r.id}` })) as never,
    );
  } catch {
    // Monitoring must never break the page that is already failing.
  }
}
