'use server';

import { createClient } from '@/lib/supabase/server';
import { actionTypesForRole } from '@/lib/notificationKinds';

export async function markRead(notificationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  const { error } = await supabase
    .from('notifications')
    .update({ read: true } as never)
    .eq('id', notificationId)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  return { ok: true };
}

export async function markAllRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  await supabase.from('notifications').update({ read: true } as never).eq('user_id', user.id).eq('read', false);
  return { ok: true };
}

/** Marks only the plain updates as read. Everything that needs action stays
 *  open until it is handled. Used by the bell's "עדכונים שוטפים" tab. */
export async function markUpdatesRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const actionTypes = actionTypesForRole((me as { role: string } | null)?.role);

  const { error } = await supabase
    .from('notifications')
    .update({ read: true } as never)
    .eq('user_id', user.id)
    .eq('read', false)
    .or(`type.is.null,type.not.in.(${actionTypes.join(',')})`);
  if (error) return { error: error.message };
  return { ok: true };
}
