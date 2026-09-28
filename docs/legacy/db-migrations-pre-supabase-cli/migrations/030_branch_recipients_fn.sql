-- Migration 030: branch_recipients() — robust notification recipient resolver.
--
-- ROOT CAUSE this fixes:
--   Notifications for a branch were resolved with `.eq('branch_id', X)` on
--   profiles. That has TWO holes:
--     1. Cross-branch staff (sees_all_branches = true) have branch_id = NULL,
--        so they were never matched — even though they must receive both
--        branches' events.
--     2. The query ran under the *acting* user's RLS. A Netivot painter cannot
--        see NULL-branch cross-branch advisors through their own RLS, so even a
--        corrected filter would return nothing for them.
--   Net effect: the Netivot branch (which has ONLY a painter in-branch; every
--   advisor/manager/office person is cross-branch or in Ashkelon) produced
--   ZERO notifications for painter requests, wash, ready-for-office, extras, etc.
--
-- THE FIX: a SECURITY DEFINER function that bypasses the caller's RLS and
-- returns every active profile that is either in the branch OR cross-branch.
-- The application filters the result down to the roles each event targets.

CREATE OR REPLACE FUNCTION public.branch_recipients(p_branch uuid)
RETURNS TABLE(id uuid, role text, is_bodywork_advisor boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p.id, p.role::text, p.is_bodywork_advisor
  FROM public.profiles p
  WHERE p.is_active = true
    AND (p.branch_id = p_branch OR p.sees_all_branches = true);
$$;

GRANT EXECUTE ON FUNCTION public.branch_recipients(uuid) TO authenticated, anon, service_role;
