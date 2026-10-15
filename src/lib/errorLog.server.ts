import 'server-only';
import { createHash } from 'crypto';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// #43 (15/10): the core of the in-house error monitor — used by the public
// reportClientError action (browser errors) and directly by server code that
// wants a failure on the board (e.g. the sticker reader, #9). One app_errors
// row per distinct error (fingerprint) with a counter. First sighting by a
// signed-in user → a BUG ticket (or a message on an existing ticket), and the
// developer gets a push; a closed ticket reopens when its error comes back.

const MAX_TICKETS_PER_DAY = 10;

export type AppErrorSource = 'boundary' | 'window' | 'promise' | 'server';
export type AppErrorInput = {
  source: AppErrorSource;
  message: string;
  digest?: string | null;
  path: string;
  stack?: string | null;
  userId: string | null;
  userAgent?: string | null;
  /** Storage path ("bucket/path") of a file that shows the failure, e.g. the sticker photo. */
  attachment?: string | null;
  /** Attach to this existing ticket instead of opening a new one. */
  ticketNo?: number;
};

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

/** Never throws — monitoring must not break what is already failing. */
export async function recordAppError(e: AppErrorInput): Promise<void> {
  try {
    const db = service();
    if (!db) return;
    const source = e.source;
    const message = cut(e.message, 1000) || '(ללא הודעה)';
    const digest = cut(e.digest, 64) || null;
    const path = normPath(cut(e.path, 300) || '/');
    const stack = cut(e.stack, 4000) || null;
    const attachment = cut(e.attachment, 300) || null;
    const userId = e.userId;

    const { data: prof } = userId ? await db.from('profiles').select('full_name, role').eq('id', userId).maybeSingle() : { data: null };
    const p = prof as { full_name: string | null; role: string } | null;

    // A server-side error reaches the browser as a generic message + digest, so the digest is the identity.
    const fingerprint = createHash('sha256').update(digest ? `digest|${digest}` : `${source}|${path}|${normMsg(message)}`).digest('hex').slice(0, 40);

    const { data: existing } = await db.from('app_errors').select('id, count, users, request_id').eq('fingerprint', fingerprint).maybeSingle();
    const ex = existing as { id: string; count: number; users: string[]; request_id: string | null } | null;
    const now = new Date().toISOString();

    if (ex) {
      const users = userId && !ex.users.includes(userId) ? [...ex.users, userId].slice(-50) : ex.users;
      await db.from('app_errors').update({ count: ex.count + 1, last_seen: now, last_user: userId, users, ...(attachment ? { attachment } : {}) } as never).eq('id', ex.id);
      // The ticket was closed but the error is back → reopen it (once per return).
      if (ex.request_id && userId) {
        const { data: t } = await db.from('app_requests').select('status').eq('id', ex.request_id).maybeSingle();
        if ((t as { status: string } | null)?.status === 'DONE') {
          await db.from('app_requests').update({ status: 'NEW', updated_at: now } as never).eq('id', ex.request_id);
          await db.from('app_request_messages').insert({ request_id: ex.request_id, body: `🔁 השגיאה חזרה אחרי שהטיקט נסגר (${p?.full_name ?? 'משתמש'}, ${path}). סה"כ ${ex.count + 1} פעמים.` } as never);
        }
      }
      return;
    }

    // Anonymous (public pages / signed out): counted, but new rows are capped per hour.
    if (!userId) {
      const { count: anon } = await db.from('app_errors').select('id', { count: 'exact', head: true }).is('first_user', null).gte('first_seen', new Date(Date.now() - 3600_000).toISOString());
      if ((anon ?? 0) >= 30) return;
    }

    const { data: row } = await db
      .from('app_errors')
      .insert({ fingerprint, source, message, digest, path, stack, attachment, user_agent: cut(e.userAgent, 300) || null, first_user: userId, last_user: userId, users: userId ? [userId] : [] } as never)
      .select('id')
      .single();
    if (!row || !userId) return;
    const rowId = (row as { id: string }).id;

    const { data: devs } = await db.from('profiles').select('id').eq('office_function', 'DEVELOPER').eq('is_active', true);
    const devIds = ((devs ?? []) as { id: string }[]).map((d) => d.id);

    const body = [
      `🤖 ${e.ticketNo ? 'נרשם אוטומטית' : 'נפתח אוטומטית'} מניטור השגיאות`,
      `משתמש: ${p?.full_name ?? '?'} (${p?.role ?? '?'})`,
      `מסך: ${path}`,
      `שגיאה: ${message.slice(0, 500)}`,
      digest ? `digest: ${digest} (שגיאת שרת — הפרטים ב-Vercel logs)` : null,
      attachment ? `קובץ: ${attachment}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    // An existing ticket (e.g. #9): a message on it, no new ticket.
    if (e.ticketNo) {
      const { data: t } = await db.from('app_requests').select('id, status').eq('ticket_no', e.ticketNo).maybeSingle();
      const tk = t as { id: string; status: string } | null;
      if (!tk) return;
      await db.from('app_errors').update({ request_id: tk.id } as never).eq('id', rowId);
      await db.from('app_request_messages').insert({ request_id: tk.id, body } as never);
      if (tk.status === 'DONE') await db.from('app_requests').update({ status: 'NEW', updated_at: now } as never).eq('id', tk.id);
      if (devIds.length)
        await db.from('notifications').insert(
          devIds.map((id) => ({ user_id: id, type: 'DIRECT_NOTE', triggered_by: userId, title: `🐞 #${e.ticketNo} · נרשמה תקלה`, body: message.slice(0, 200), action_url: `/bugs#${tk.id}` })) as never,
        );
      return;
    }

    // Auto-ticket — capped, so an error storm can't flood the board.
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: today } = await db.from('app_errors').select('id', { count: 'exact', head: true }).not('request_id', 'is', null).gte('first_seen', since);
    if ((today ?? 0) >= MAX_TICKETS_PER_DAY || !devIds.length) return;

    const { data: req } = await db.from('app_requests').insert({ body, kind: 'BUG', priority: 2, created_by: devIds[0] } as never).select('id, ticket_no').single();
    const r = req as { id: string; ticket_no: number } | null;
    if (!r) return;
    await db.from('app_request_messages').insert({ request_id: r.id, body, author_id: devIds[0] } as never);
    await db.from('app_errors').update({ request_id: r.id } as never).eq('id', rowId);
    await db.from('notifications').insert(
      devIds.map((id) => ({ user_id: id, type: 'DIRECT_NOTE', triggered_by: userId, title: `🐞 שגיאה חדשה · #${r.ticket_no}`, body: `${path} — ${message.slice(0, 200)}`, action_url: `/bugs#${r.id}` })) as never,
    );
  } catch {
    // Monitoring must never break the page that is already failing.
  }
}
