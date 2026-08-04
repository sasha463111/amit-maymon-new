import type { createClient } from '@/lib/supabase/server';

// Exactly the (awaited) server client the 'use server' actions pass in. Typing
// it this way sidesteps supabase-js generic-arity churn across versions.
type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export type RecipientCandidate = {
  id: string;
  role: string;
  is_bodywork_advisor: boolean | null;
};

/**
 * Resolve notification recipients for a branch — INCLUDING cross-branch staff
 * (profiles flagged `sees_all_branches`).
 *
 * This goes through the `branch_recipients` SECURITY DEFINER RPC on purpose, so
 * it bypasses the *acting* user's RLS. That matters because, for example, a
 * Netivot painter cannot see the NULL-branch cross-branch advisors (נסיה / ערן)
 * through their own RLS — yet those advisors must still be notified when the
 * painter opens a request. A plain `.eq('branch_id', x)` query both misses the
 * cross-branch staff (NULL branch) and is clipped by the actor's RLS, which is
 * exactly why Netivot events produced zero notifications.
 *
 * Returns every active profile that is either in the branch or marked
 * cross-branch. The caller filters down to the roles it cares about.
 */
export async function branchRecipients(
  supabase: ServerSupabase,
  branchId: string | null | undefined
): Promise<RecipientCandidate[]> {
  if (!branchId) return [];
  // `as never` follows this codebase's idiom for RPCs not present in the
  // generated Database types (see e.g. save_push_subscription).
  const { data, error } = await supabase.rpc('branch_recipients' as never, { p_branch: branchId } as never);
  if (error) {
    console.error('[branchRecipients] rpc failed:', (error as { message?: string }).message);
    return [];
  }
  return (data ?? []) as RecipientCandidate[];
}
