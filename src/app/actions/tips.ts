'use server';

import { createClient } from '@/lib/supabase/server';
import { TIP_KEYS } from '@/lib/tips';

// First-visit tips (16/10): what this person has already seen. RLS keeps
// every row to its own user (migration 20261016150000_user_tips_seen).

export async function markTipsSeen(keys: string[]): Promise<{ ok?: true; error?: string }> {
  const valid = Array.from(new Set((keys ?? []).filter((k) => typeof k === 'string' && TIP_KEYS.has(k))));
  if (!valid.length) return { ok: true };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };
  const { error } = await supabase
    .from('user_tips_seen')
    .upsert(valid.map((tip_key) => ({ user_id: user.id, tip_key })) as never, { onConflict: 'user_id,tip_key', ignoreDuplicates: true });
  return error ? { error: error.message } : { ok: true };
}

/** "הצג טיפים שוב" in the personal menu. */
export async function resetMyTips(): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };
  const { error } = await supabase.from('user_tips_seen').delete().eq('user_id', user.id);
  return error ? { error: error.message } : { ok: true };
}
