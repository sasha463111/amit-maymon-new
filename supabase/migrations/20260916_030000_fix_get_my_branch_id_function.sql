-- Fix get_my_branch_id() function to use branch_ids array
--
-- Root cause: The get_my_branch_id() function was still trying to access
-- profiles.branch_id column which was deleted in migration 046 when we
-- changed to branch_ids (array) for multi-branch support.
--
-- Impact: Any RLS policy using get_my_branch_id() would fail with:
-- "ERROR: column 'branch_id' does not exist"
--
-- This affected:
-- - referral_documents RLS policies (insert/select)
-- - Any code trying to view or edit referrals
--
-- Fix: Return first element from branch_ids array instead

CREATE OR REPLACE FUNCTION public.get_my_branch_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  AS $function$
  SELECT (branch_ids[1])::uuid FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$function$;
