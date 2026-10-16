import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

// Speed (16/10): one auth check + one profile read per request. A page and the
// server actions it calls while rendering (listPartReturns, listSupplierDocs…)
// each used to call auth.getUser() + read the profile again — every one a
// network round trip, in series. React cache() dedupes within one request only.

export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
});

export type MyProfile = { id: string; full_name: string | null; role: string; branch_ids: string[] | null; is_active: boolean; sees_all_branches?: boolean | null };

export const getMyProfile = cache(async (): Promise<MyProfile | null> => {
  const { supabase, user } = await getSessionUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('id, full_name, role, branch_ids, is_active, sees_all_branches').eq('id', user.id).maybeSingle();
  return (data as MyProfile | null) ?? null;
});
