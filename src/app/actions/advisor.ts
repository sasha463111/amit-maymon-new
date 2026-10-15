'use server';

import { canUseAdvisor } from '@/lib/advisorAccess';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { apiKey } from '@/lib/stickerReader';
import { askClaude } from '@/lib/advisor.server';

// "🤖 התייעצות" (Amit, 2026-10-15) — AMIT ONLY (advisorAccess.ts). Stored per
// user (advisor_messages). Change requests the advisor files land in
// app_requests and wait for Tomer's approval (Tomer, 15/10: option ב׳), with a
// push to the other CEO account (Tomer).

const HISTORY = 30;

async function ceo() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role, is_active, full_name').eq('id', user.id).maybeSingle();
  const p = data as { role: string; is_active: boolean; full_name: string | null } | null;
  // Amit only (advisorAccess.ts) — not every CEO.
  if (!p || p.role !== 'CEO' || p.is_active === false || !canUseAdvisor(user.id)) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { user, name: p.full_name ?? '', db: createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) };
}

export type AdvisorMessage = { id: string; role: 'user' | 'assistant'; content: string; at: string };

export async function getAdvisor(): Promise<{ available: boolean; messages: AdvisorMessage[] }> {
  const c = await ceo();
  if (!c) return { available: false, messages: [] };
  const [{ data }, key] = await Promise.all([
    c.db.from('advisor_messages').select('id, role, content, created_at').eq('user_id', c.user.id).order('created_at').limit(200),
    apiKey(),
  ]);
  return {
    available: !!key,
    messages: ((data ?? []) as { id: string; role: 'user' | 'assistant'; content: string; created_at: string }[]).map((m) => ({ id: m.id, role: m.role, content: m.content, at: m.created_at })),
  };
}

export async function askAdvisor(text: string): Promise<{ ok?: true; error?: string; filed?: number }> {
  const c = await ceo();
  if (!c) return { error: 'אין הרשאה' };
  const q = (text ?? '').trim().slice(0, 4000);
  if (!q) return { error: 'נא לכתוב שאלה' };
  const key = await apiKey();
  if (!key) return { error: 'היועץ עוד לא מחובר' };

  await c.db.from('advisor_messages').insert({ user_id: c.user.id, role: 'user', content: q } as never);
  const { data } = await c.db.from('advisor_messages').select('role, content').eq('user_id', c.user.id).order('created_at', { ascending: false }).limit(HISTORY);
  const history = ((data ?? []) as { role: 'user' | 'assistant'; content: string }[]).reverse();
  while (history.length && history[0].role !== 'user') history.shift(); // the API wants the user first

  const fileRequest = async (summary: string, details: string) => {
    const body = `${summary}\n\n${details}`.trim();
    const { data: req, error } = await c.db.from('app_requests').insert({ body, created_by: c.user.id } as never).select('id').single();
    if (error || !req) return 'failed to record the request';
    const id = (req as { id: string }).id;
    await c.db.from('app_request_messages').insert({ request_id: id, body: `${body}\n\n(נרשם מתוך ההתייעצות)`, author_id: c.user.id } as never);
    const { data: others } = await c.db.from('profiles').select('id').eq('role', 'CEO').eq('is_active', true).neq('id', c.user.id);
    const rows = ((others ?? []) as { id: string }[]).map((p) => ({
      user_id: p.id, type: 'DIRECT_NOTE', triggered_by: c.user.id,
      title: `💡 בקשה חדשה מ${c.name.split(' ')[0] || 'עמית'} — ממתינה לאישורך`, body: summary.slice(0, 300), action_url: `/requests#${id}`,
    }));
    if (rows.length) await c.db.from('notifications').insert(rows as never);
    return 'recorded; it now waits for Tomer\'s approval';
  };

  try {
    const r = await askClaude(key, history, fileRequest);
    await c.db.from('advisor_messages').insert({ user_id: c.user.id, role: 'assistant', content: r.text || '…' } as never);
    revalidatePath('/requests');
    return { ok: true, filed: r.filed };
  } catch {
    await c.db.from('advisor_messages').insert({ user_id: c.user.id, role: 'assistant', content: 'מצטער, הייתה תקלה בחיבור ליועץ. נסה שוב בעוד דקה.' } as never);
    return { error: 'התקלה נרשמה — נסה שוב' };
  }
}

/** "שיחה חדשה" — clears this person's conversation (the requests stay). */
export async function clearAdvisor(): Promise<{ ok?: true }> {
  const c = await ceo();
  if (!c) return {};
  await c.db.from('advisor_messages').delete().eq('user_id', c.user.id);
  revalidatePath('/requests');
  return { ok: true };
}
