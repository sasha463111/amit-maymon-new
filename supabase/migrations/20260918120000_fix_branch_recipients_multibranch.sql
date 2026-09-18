-- Fix branch_recipients() — the root cause of ALL notifications being dead
--
-- Symptom: zero notifications system-wide since 2026-09-01, despite 20 new
-- referrals, 6 new cases, 13 status updates and 2 painter requests being created
-- in that window.
--
-- Root cause: branch_recipients() — the SECURITY DEFINER RPC that resolves WHO
-- should be notified for a branch event — still filtered on p.branch_id, the
-- column dropped when profiles moved to the branch_ids array. Every call raised
--   ERROR 42703: column p.branch_id does not exist
--
-- Why nobody saw an error: src/lib/recipients.ts catches the RPC failure,
-- console.errors it and returns []. Zero recipients means notifyRelevantParties()
-- had nobody to write notification rows for and nobody to push to, so every
-- event silently produced nothing. No user-facing error was ever raised.
--
-- Fix: match the branch against the branch_ids array, same pattern already
-- applied to the RLS policies and storage helpers. Cross-branch staff
-- (sees_all_branches) keep receiving everything, as before.

CREATE OR REPLACE FUNCTION public.branch_recipients (p_branch uuid)
  RETURNS TABLE (id uuid, role text, is_bodywork_advisor boolean)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT p.id, p.role::text, p.is_bodywork_advisor
  FROM public.profiles p
  WHERE p.is_active = true
    AND (p_branch = ANY(p.branch_ids) OR p.sees_all_branches = true);
$function$;
