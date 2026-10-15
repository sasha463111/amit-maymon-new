'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// "🆕 מה חדש" (Tomer, 15/10): announcements created when a request that
// affects everyone is closed (setRequestStatus → announce). Everyone sees the
// banner at the top of the dashboard until they dismiss it; dismissals are per
// user (RLS: own rows only).

export type Announcement = { id: string; title: string; body: string | null; created_at: string };

/** Active announcements from the last 30 days that I haven't dismissed. */
export async function listMyAnnouncements(): Promise<Announcement[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: items }, { data: gone }] = await Promise.all([
    supabase.from('app_announcements').select('id, title, body, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(10),
    supabase.from('app_announcement_dismissals').select('announcement_id').eq('user_id', user.id),
  ]);
  const dismissed = new Set(((gone ?? []) as { announcement_id: string }[]).map((d) => d.announcement_id));
  return ((items ?? []) as Announcement[]).filter((a) => !dismissed.has(a.id)).slice(0, 3);
}

export async function dismissAnnouncement(id: string): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };
  const { error } = await supabase.from('app_announcement_dismissals').upsert({ announcement_id: id, user_id: user.id } as never, { onConflict: 'announcement_id,user_id', ignoreDuplicates: true });
  if (error) return { error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}
