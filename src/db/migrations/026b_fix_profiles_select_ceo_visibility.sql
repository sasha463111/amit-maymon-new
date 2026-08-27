-- Migration 026 — Fix in-app notifications: profiles_select recipient visibility
--
-- ROOT CAUSE of "no in-app notifications fire (only the push test works)":
-- Every notification path in the server actions resolves its recipients by
-- querying public.profiles (advisors in a branch, CEOs for approvals, office
-- staff, etc.). The profiles_select RLS policy was:
--     ((id = auth.uid()) OR (branch_id = get_my_branch_id()))
-- with NO CEO bypass. Two fatal consequences:
--   1. The CEO has branch_id = NULL by design, so get_my_branch_id() = NULL and
--      `branch_id = NULL` never matches -> the CEO could see ONLY their own
--      profile. Any CEO-triggered action found ZERO recipients.
--   2. Branch staff could not see CEO profiles (CEOs have NULL branch), so
--      notifyCeosPendingApproval (SELECT ... WHERE role='CEO') found ZERO CEOs
--      -> estimate-approval notifications were never created.
-- The notification INSERTs were always valid; the recipient list was always
-- empty. (Verified: authenticated insert returns 201; recipient SELECT returned
-- 0 for the CEO, 4 via service role.)
--
-- FIX: restore the CEO bypass (lost after migration 019) and make CEO profiles
-- visible to all authenticated users so they can be resolved as recipients.
-- Same-branch visibility is preserved; cross-branch isolation is otherwise intact.

-- Recursion-safe role helper (mirrors get_my_branch_id: SECURITY DEFINER so the
-- profiles policy does not re-trigger RLS on profiles -> no infinite recursion).
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1; $$;

REVOKE ALL ON FUNCTION public.get_my_role() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR role = 'CEO'                       -- staff must see CEOs to notify them
    OR public.get_my_role() = 'CEO'       -- CEO sees everyone (CEO has no branch)
    OR branch_id = public.get_my_branch_id()
  );
