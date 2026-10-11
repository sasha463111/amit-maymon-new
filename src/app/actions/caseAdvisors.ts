'use server';

import { createClient } from '@/lib/supabase/server';
import { getCaseAdvisors } from '@/lib/caseAdvisors';

/** "יועץ מטפל" per case for client components (the notifications bell).
 *  The ids are first passed through RLS, so a user only learns about cases
 *  they may see. */
export async function getAdvisorsForCases(caseIds: string[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(caseIds)).slice(0, 200);
  if (ids.length === 0) return {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};
  const { data } = await supabase.from('cases').select('id').in('id', ids);
  const visible = ((data ?? []) as { id: string }[]).map((r) => r.id);
  const map = await getCaseAdvisors(visible);
  return Object.fromEntries(Array.from(map.entries()).map(([k, v]) => [k, v[0]]));
}
