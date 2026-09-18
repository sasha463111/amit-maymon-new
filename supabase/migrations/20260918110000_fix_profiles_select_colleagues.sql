-- Allow staff to see active colleagues' profiles (2026-09-18 deep audit)
--
-- Problem: profiles_select was `(id = auth.uid()) OR can_see_all_branches()`.
-- can_see_all_branches() is true only for CEO / sees_all_branches, so every
-- non-CEO user could read ONLY their own profile row. That silently broke:
--
--   1. Bodywork-advisor picker on the case page
--      (cases/[id]/page.tsx: .eq('is_bodywork_advisor', true)) -> always empty
--      for SERVICE_MANAGER, so no advisor could be assigned.
--   2. Actor names in the case activity log / audit trail
--      (cases/[id]/page.tsx: .in('id', userIdSet)) -> only own name resolved,
--      every other actor rendered blank.
--   3. "Deleted by" names in the archive (cases/archive/page.tsx).
--
-- Fix: active profiles are visible to any authenticated user. Inactive
-- profiles stay restricted to the owner and CEO, so deactivated staff are not
-- exposed. Writes are unaffected (separate policy).
--
-- NOTE: profiles.push_subscriptions is a legacy column (live push data lives in
-- the separate push_subscriptions table, which has its own owner-only RLS).
-- One row still holds legacy data there; consider clearing that column.

DROP POLICY IF EXISTS "profiles_select" ON "public"."profiles";

CREATE POLICY "profiles_select" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING (
    id = auth.uid()
    OR public.can_see_all_branches()
    OR is_active = true
  );
