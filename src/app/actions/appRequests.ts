'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// "💡 הצעות ייעול" (Amit, 2026-10-15): Amit's improvement requests and the
// conversation about each one, inside the app (GitHub went private). CEO only.
// The development side answers from the terminal with dev_reply_request()
// (see .claude/skills/amit-requests). A new request / message from Amit pushes
// to the other CEO account (Tomer) as a DIRECT_NOTE.

const BUCKET = 'app-requests';
const MAX_FILE = 4 * 1024 * 1024;

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function ceo() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role, is_active, full_name').eq('id', user.id).maybeSingle();
  const p = data as { role: string; is_active: boolean; full_name: string | null } | null;
  if (!p || p.role !== 'CEO' || p.is_active === false) return null;
  const db = service();
  if (!db) return null;
  return { user, db, name: p.full_name ?? '' };
}

export type RequestStatus = 'NEW' | 'IN_PROGRESS' | 'DONE' | 'NO';
export type AppRequestMessage = { id: string; body: string; image_url: string | null; author: string; from_dev: boolean; at: string };
export type AppRequest = { id: string; status: RequestStatus; created_at: string; updated_at: string; by: string; messages: AppRequestMessage[] };

export async function listAppRequests(): Promise<AppRequest[]> {
  const c = await ceo();
  if (!c) return [];
  const [{ data: reqs }, { data: msgs }] = await Promise.all([
    c.db.from('app_requests').select('id, status, created_by, created_at, updated_at').order('updated_at', { ascending: false }).limit(300),
    c.db.from('app_request_messages').select('id, request_id, body, image_path, author_id, created_at').order('created_at').limit(3000),
  ]);
  type R = { id: string; status: RequestStatus; created_by: string; created_at: string; updated_at: string };
  type M = { id: string; request_id: string; body: string; image_path: string | null; author_id: string | null; created_at: string };
  const rs = (reqs ?? []) as R[];
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

async function saveImage(c: NonNullable<Awaited<ReturnType<typeof ceo>>>, requestId: string, file: FormDataEntryValue | null): Promise<{ path?: string | null; error?: string }> {
  if (!(file instanceof File) || file.size === 0) return { path: null };
  if (file.size > MAX_FILE) return { error: 'התמונה גדולה מדי (עד 4MB)' };
  if (!/^image\//.test(file.type)) return { error: 'אפשר לצרף רק תמונה (צילום מסך)' };
  const ext = (file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? 'jpg').toLowerCase();
  const path = `${requestId}/${crypto.randomUUID()}.${ext}`;
  const up = await c.db.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { error: up.error.message };
  return { path };
}

/** Tell the other CEO account(s) — the developer side (Tomer) — by push. */
async function notifyDev(c: NonNullable<Awaited<ReturnType<typeof ceo>>>, requestId: string, title: string, body: string) {
  const { data } = await c.db.from('profiles').select('id').eq('role', 'CEO').eq('is_active', true).neq('id', c.user.id);
  const rows = ((data ?? []) as { id: string }[]).map((p) => ({
    user_id: p.id, type: 'DIRECT_NOTE', triggered_by: c.user.id, title, body: body.slice(0, 300), action_url: `/requests#${requestId}`,
  }));
  if (rows.length) await c.db.from('notifications').insert(rows as never);
}

export async function createAppRequest(fd: FormData): Promise<{ ok?: true; error?: string }> {
  const c = await ceo();
  if (!c) return { error: 'אין הרשאה' };
  const body = String(fd.get('body') ?? '').trim().slice(0, 5000);
  if (body.length < 3 && !(fd.get('image') instanceof File)) return { error: 'נא לכתוב את הבקשה' };
  const { data, error } = await c.db.from('app_requests').insert({ body: body || '(צילום מסך)', created_by: c.user.id } as never).select('id').single();
  if (error || !data) return { error: error?.message ?? 'לא נשמר' };
  const id = (data as { id: string }).id;
  const img = await saveImage(c, id, fd.get('image'));
  if (img.error) return { error: img.error };
  await c.db.from('app_request_messages').insert({ request_id: id, body, image_path: img.path ?? null, author_id: c.user.id } as never);
  await notifyDev(c, id, `💡 בקשה חדשה מ${c.name.split(' ')[0] || 'עמית'}`, body);
  revalidatePath('/requests');
  return { ok: true };
}

export async function addRequestMessage(fd: FormData): Promise<{ ok?: true; error?: string }> {
  const c = await ceo();
  if (!c) return { error: 'אין הרשאה' };
  const id = String(fd.get('request_id') ?? '');
  const body = String(fd.get('body') ?? '').trim().slice(0, 5000);
  const { data: req } = await c.db.from('app_requests').select('id').eq('id', id).maybeSingle();
  if (!req) return { error: 'הבקשה לא נמצאה' };
  const img = await saveImage(c, id, fd.get('image'));
  if (img.error) return { error: img.error };
  if (!body && !img.path) return { error: 'נא לכתוב משהו או לצרף תמונה' };
  await c.db.from('app_request_messages').insert({ request_id: id, body, image_path: img.path ?? null, author_id: c.user.id } as never);
  await c.db.from('app_requests').update({ updated_at: new Date().toISOString() } as never).eq('id', id);
  await notifyDev(c, id, `💬 תגובה מ${c.name.split(' ')[0] || 'עמית'} על בקשה`, body || '(צילום מסך)');
  revalidatePath('/requests');
  return { ok: true };
}

export async function setRequestStatus(id: string, status: RequestStatus): Promise<{ ok?: true; error?: string }> {
  const c = await ceo();
  if (!c) return { error: 'אין הרשאה' };
  if (!['NEW', 'IN_PROGRESS', 'DONE', 'NO'].includes(status)) return { error: 'סטטוס לא תקין' };
  const { error } = await c.db.from('app_requests').update({ status, updated_at: new Date().toISOString() } as never).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/requests');
  return { ok: true };
}
