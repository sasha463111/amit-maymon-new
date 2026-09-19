import type { createClient } from '@/lib/supabase/server';

// Exactly the (awaited) server client the 'use server' actions pass in, matching
// the idiom already used by src/lib/recipients.ts.
type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * The eight actions governed by the Settings > Permissions matrix
 * (public.role_permissions). Keep this union in sync with the `action` values
 * seeded in that table — a typo here would silently deny, since unknown
 * role/action pairs are treated as "not permitted".
 */
export type PermissionAction =
  | 'create_case'
  | 'create_referral'
  | 'complete_professional_step'
  | 'complete_closure_step'
  | 'decide_approvals'
  | 'upload_documents'
  | 'delete_documents'
  | 'manage_extras_status'
  | 'manage_settings';

/**
 * Ask the database whether the CURRENT user's role may perform `action`,
 * according to the permission matrix the CEO controls in Settings.
 *
 * Goes through the `has_permission` SECURITY DEFINER RPC rather than reading
 * role_permissions directly: the table is CEO-only under RLS, so a plain select
 * would return nothing for every other role and deny everyone.
 *
 * CEO always passes (the Settings UI refuses to edit CEO rows, so the CEO can
 * never lock themselves out). Branch isolation is NOT handled here — callers
 * keep their own branch checks, and this only answers "is this role allowed to
 * do this kind of thing at all".
 *
 * FAILS CLOSED on error. An unreachable permission check must block the action
 * rather than wave it through: a denial is visible and gets reported within
 * minutes, whereas silently skipping enforcement is the exact failure mode that
 * let branch_recipients() sit broken for 17 days without anyone noticing.
 */
export async function hasPermission(
  supabase: ServerSupabase,
  action: PermissionAction
): Promise<boolean> {
  // `as never` follows this codebase's idiom for RPCs absent from the generated
  // Database types (see branchRecipients / save_push_subscription).
  const { data, error } = await supabase.rpc('has_permission' as never, { p_action: action } as never);
  if (error) {
    console.error('[hasPermission] rpc failed for', action, ':', (error as { message?: string }).message);
    return false;
  }
  return data === true;
}
