'use server';

import { createClient } from '@/lib/supabase/server';
import { checkClaudeConnection } from '@/lib/stickerReader';

// "🤖 בדיקת חיבור Claude" in Settings (Tomer, 15/10): sticker / invoice reading
// and the advisor all need the Anthropic key. One click says whether it works,
// and why not (no key / invalid / no credit / overloaded).
export async function testClaudeConnection(): Promise<{ ok: boolean; detail: string; source?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, detail: '', error: 'לא מחובר' };
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if ((data as { role: string } | null)?.role !== 'CEO') return { ok: false, detail: '', error: 'אין הרשאה' };
  const r = await checkClaudeConnection();
  return { ok: r.ok, detail: r.detail, source: r.source === 'env' ? 'Vercel' : r.source === 'vault' ? 'Vault' : 'אין' };
}
