'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// "💡 הצעות ייעול" (Amit, 2026-10-15): Amit's improvement requests and the
// conversation about each one, inside the app (GitHub went private).
// Since 15/10 (Tomer, after Liron's feedback) open to every active user as
// "💡 הערות לשיפור": staff see only their own notes, a CEO sees all of them.
// The development side answers from the terminal with dev_reply_request()
// (see .claude/skills/amit-requests). A new note / message pushes to the
// developer account only (profiles.office_function 'DEVELOPER') as a DIRECT_NOTE — not to Amit, who
// asked for fewer pushes; he sees the staff notes on the page.

const BUCKET = 'app-requests';
const MAX_FILE = 4 * 1024 * 1024;

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}


async function member() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role, is_active, full_name').eq('id', user.id).maybeSingle();
  const p = data as { role: string; is_active: boolean; full_name: string | null } | null;
  if (!p || p.is_active === false) return null;
  const db = service();
  if (!db) return null;
  return { user, db, name: p.full_name ?? '', isCeo: p.role === 'CEO' };
}

export type RequestStatus = 'NEW' | 'IN_PROGRESS' | 'DONE' | 'NO';
// Bugs / features boards (Tomer, 15/10): tagged when opened, managed on
// /bugs and /features (CEO). null = not tagged yet (requests from before).
export type RequestKind = 'BUG' | 'FEATURE';
export type AppRequestMessage = { id: string; body: string; image_url: string | null; author: string; from_dev: boolean; at: string };
export type AppRequest = { id: string; status: RequestStatus; kind: RequestKind | null; priority: number | null; created_at: string; updated_at: string; by: string; messages: AppRequestMessage[] };

export async function listAppRequests(): Promise<AppRequest[]> {
  const c = await member();
  if (!c) return [];
  let rq = c.db.from('app_requests').select('id, status, kind, priority, created_by, created_at, updated_at').order('updated_at', { ascending: false }).limit(500);
  if (!c.isCeo) rq = rq.eq('created_by', c.user.id);
  const { data: reqs } = await rq;
  type R = { id: string; status: RequestStatus; kind: RequestKind | null; priority: number | null; created_by: string; created_at: string; updated_at: string };
  type M = { id: string; request_id: string; body: string; image_path: string | null; author_id: string | null; created_at: string };
  const rs = (reqs ?? []) as R[];
  if (!rs.length) return [];
  const { data: msgs } = await c.db.from('app_request_messages').select('id, request_id, body, image_path, author_id, created_at').in('request_id', rs.map((r) => r.id)).order('created_at').limit(3000);
  const ms = (msgs ?? []) as M[];
  const people = Array.from(new Set([...rs.map((r) => r.created_by), ...ms.map((m) => m.author_id)].filter((x): x is string => !!x)));
  const paths = ms.map((m) => m.image_path).filter((x): x is string => !!x);
  const [{ data: names }, signed] = await Promise.all([
    people.length ? c.db.from('profiles').select('id, full_name').in('id', people) : Promise.resolve({ data: [] }),
    paths.length ? c.db.storage.from(BUCKET).createSignedUrls(paths, 3600) : Promise.resolve({ data: [] }),
  ]);
  const nameById = new Map(((names ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? '']));
  const urlByPath = new Map(((signed.data ?? []) as { path: string | null; signedUrl: string }[]).map((s) => [s.path, s.signedUrl]));
  return rs.map((r) => ({
    id: r.id,
    status: r.status,
    kind: r.kind,
    priority: r.priority,
    created_at: r.created_at,
    updated_at: r.updated_at,
    by: nameById.get(r.created_by) ?? '',
    messages: ms
      .filter((m) => m.request_id === r.id)
      .map((m) => ({
        id: m.id,
        body: m.body,
        image_url: m.image_path ? urlByPath.get(m.image_path) ?? null : null,
        author: m.author_id ? nameById.get(m.author_id) ?? '' : 'צוות הפיתוח',
        from_dev: !m.author_id,
        at: m.created_at,
      })),
  }));
}

async function saveImage(c: NonNullable<Awaited<ReturnType<typeof member>>>, requestId: string, file: FormDataEntryValue | null): Promise<{ path?: string | null; error?: string }> {
  if (!(file instanceof File) || file.size === 0) return { path: null };
  if (file.size > MAX_FILE) return { error: 'התמונה גדולה מדי (עד 4MB)' };
  if (!/^image\//.test(file.type)) return { error: 'אפשר לצרף רק תמונה (צילום מסך)' };
  const ext = (file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? 'jpg').toLowerCase();
  const path = `${requestId}/${crypto.randomUUID()}.${ext}`;
  const up = await c.db.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { error: up.error.message };
  return { path };
}

/** Tell the developer side (Tomer) by push. */
async function notifyDev(c: NonNullable<Awaited<ReturnType<typeof member>>>, requestId: string, title: string, body: string, kind?: string | null) {
  const page = kind === 'BUG' ? '/bugs' : kind === 'FEATURE' ? '/features' : '/requests';
  const { data } = await c.db.from('profiles').select('id').eq('office_function', 'DEVELOPER').eq('is_active', true).neq('id', c.user.id);
  const rows = ((data ?? []) as { id: string }[]).map((p) => ({
    user_id: p.id, type: 'DIRECT_NOTE', triggered_by: c.user.id, title, body: body.slice(0, 300), action_url: `${page}#${requestId}`,
  }));
  if (rows.length) await c.db.from('notifications').insert(rows as never);
}

export async function createAppRequest(fd: FormData): Promise<{ ok?: true; error?: string }> {
  const c = await member();
  if (!c) return { error: 'אין הרשאה' };
  const body = String(fd.get('body') ?? '').trim().slice(0, 5000);
  if (body.length < 3 && !(fd.get('image') instanceof File)) return { error: 'נא לכתוב את הבקשה' };
  const kind = String(fd.get('kind') ?? '');
  if (kind !== 'BUG' && kind !== 'FEATURE') return { error: 'נא לבחור: באג או פיתוח' };
  const { data, error } = await c.db.from('app_requests').insert({ body: body || '(צילום מסך)', kind, created_by: c.user.id } as never).select('id').single();
  if (error || !data) return { error: error?.message ?? 'לא נשמר' };
  const id = (data as { id: string }).id;
  const img = await saveImage(c, id, fd.get('image'));
  if (img.error) return { error: img.error };
  await c.db.from('app_request_messages').insert({ request_id: id, body, image_path: img.path ?? null, author_id: c.user.id } as never);
  await notifyDev(c, id, `${kind === 'BUG' ? '🐞 באג חדש' : '🚀 בקשת פיתוח'} מ${c.name.split(' ')[0] || 'עובד'}`, body, kind);
  revalidatePath('/requests');
  return { ok: true };
}

export async function addRequestMessage(fd: FormData): Promise<{ ok?: true; error?: string }> {
  const c = await member();
  if (!c) return { error: 'אין הרשאה' };
  const id = String(fd.get('request_id') ?? '');
  const body = String(fd.get('body') ?? '').trim().slice(0, 5000);
  const { data: req } = await c.db.from('app_requests').select('id, created_by, kind').eq('id', id).maybeSingle();
  // Staff answer only in their own notes.
  if (!req || (!c.isCeo && (req as { created_by: string }).created_by !== c.user.id)) return { error: 'הבקשה לא נמצאה' };
  const img = await saveImage(c, id, fd.get('image'));
  if (img.error) return { error: img.error };
  if (!body && !img.path) return { error: 'נא לכתוב משהו או לצרף תמונה' };
  await c.db.from('app_request_messages').insert({ request_id: id, body, image_path: img.path ?? null, author_id: c.user.id } as never);
  await c.db.from('app_requests').update({ updated_at: new Date().toISOString() } as never).eq('id', id);
  const owner = (req as { created_by: string }).created_by;
  if (c.isCeo && owner !== c.user.id) {
    await notifyOwner(c, owner, id, '💬 תשובה על הבקשה שלך', body || '(צילום מסך)');
  } else {
    await notifyDev(c, id, `💬 תגובה מ${c.name.split(' ')[0] || 'עובד'} על הערה`, body || '(צילום מסך)', (req as { kind: string | null }).kind);
  }
  revalidatePath('/requests');
  return { ok: true };
}

export async function setRequestStatus(id: string, status: RequestStatus): Promise<{ ok?: true; error?: string }> {
  const c = await member();
  if (!c?.isCeo) return { error: 'אין הרשאה' };
  if (!['NEW', 'IN_PROGRESS', 'DONE', 'NO'].includes(status)) return { error: 'סטטוס לא תקין' };
  const { data: req } = await c.db.from('app_requests').select('created_by, status').eq('id', id).maybeSingle();
  const r = req as { created_by: string; status: RequestStatus } | null;
  if (!r) return { error: 'הבקשה לא נמצאה' };
  const { error } = await c.db.from('app_requests').update({ status, updated_at: new Date().toISOString() } as never).eq('id', id);
  if (error) return { error: error.message };
  if (r.created_by !== c.user.id && r.status !== status && status !== 'NEW') {
    const title = status === 'DONE' ? '✅ הבקשה שלך בוצעה' : status === 'IN_PROGRESS' ? '🔧 התחלנו לעבוד על הבקשה שלך' : '⏸ הבקשה שלך נדחתה לבינתיים';
    await notifyOwner(c, r.created_by, id, title, 'פרטים בדף ההערות לשיפור');
  }
  revalidatePath('/bugs');
  revalidatePath('/features');
  revalidatePath('/requests');
  return { ok: true };
}

/** Tell the person who opened the request (bell + push). */
async function notifyOwner(c: NonNullable<Awaited<ReturnType<typeof member>>>, userId: string, requestId: string, title: string, body: string) {
  await c.db.from('notifications').insert({
    user_id: userId, type: 'DIRECT_NOTE', triggered_by: c.user.id, title, body: body.slice(0, 300), action_url: `/requests#${requestId}`,
  } as never);
}

/** CEO: re-tag a request (bug ↔ feature). */
export async function setRequestKind(id: string, kind: RequestKind): Promise<{ ok?: true; error?: string }> {
  const c = await member();
  if (!c?.isCeo) return { error: 'אין הרשאה' };
  if (kind !== 'BUG' && kind !== 'FEATURE') return { error: 'סוג לא תקין' };
  const { error } = await c.db.from('app_requests').update({ kind } as never).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/bugs');
  revalidatePath('/features');
  revalidatePath('/requests');
  return { ok: true };
}

/** CEO: priority 1 (high) … 3 (low), or null. */
export async function setRequestPriority(id: string, priority: number | null): Promise<{ ok?: true; error?: string }> {
  const c = await member();
  if (!c?.isCeo) return { error: 'אין הרשאה' };
  if (priority !== null && ![1, 2, 3].includes(priority)) return { error: 'עדיפות לא תקינה' };
  const { error } = await c.db.from('app_requests').update({ priority } as never).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/bugs');
  revalidatePath('/features');
  return { ok: true };
}
