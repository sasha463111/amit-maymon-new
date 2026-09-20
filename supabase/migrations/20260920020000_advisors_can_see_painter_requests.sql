-- Let service advisors actually SEE the painter requests they are notified about
--
-- Completes the 2026-09-18 fix, which was only half of the story. That change
-- let SERVICE_ADVISOR open /painters and /painters/[id] and call
-- respondToPainterRequest — but painter_requests_select still listed only
-- PAINTER (own rows), SERVICE_MANAGER (own branches) and CEO.
--
-- Net effect after that partial fix: נסיה could finally open the page her 98
-- notifications pointed at, and would have found an empty list. Exactly the
-- "half-granted permission" failure mode Standing Rule #5 warns about — and it
-- was introduced while fixing a different half-granted permission.
--
-- painter_requests_update already allows any role with branch access, so being
-- able to read is the only thing that was missing to make responding work.
--
-- SERVICE_ADVISOR gets the same branch scoping as SERVICE_MANAGER: they see
-- requests on cases in their own branches, never outside them.

DROP POLICY IF EXISTS "painter_requests_select" ON "public"."painter_requests";

CREATE POLICY "painter_requests_select" ON "public"."painter_requests"
  FOR SELECT
  TO "authenticated"
  USING (
    -- A painter sees the requests they raised themselves
    ((public.get_my_role() = 'PAINTER'::public.user_role) AND (created_by = auth.uid()))
    -- Service managers and service advisors see requests on their branches'
    -- cases: both roles are notified about them and expected to respond.
    OR ((public.get_my_role() = ANY (ARRAY['SERVICE_MANAGER'::public.user_role,
                                           'SERVICE_ADVISOR'::public.user_role]))
        AND EXISTS (
          SELECT 1 FROM public.cases c
          WHERE c.id = painter_requests.case_id
            AND (c.branch_id = ANY (public.get_my_branch_ids())
                 OR public.can_see_all_branches())
        ))
    OR (public.get_my_role() = 'CEO'::public.user_role)
  );
