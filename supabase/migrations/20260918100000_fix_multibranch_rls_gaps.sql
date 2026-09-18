-- Fix remaining multi-branch RLS gaps found in deep audit (2026-09-18)
--
-- Gap 1: referral_status_updates policies still used get_my_branch_id() (singular),
--        which returns only branch_ids[1]. OFFICE staff assigned to 2+ branches could
--        not read or write status updates on referrals belonging to their 2nd branch.
--        Same class of bug already fixed for referral_documents in 20260917000000.
--
-- Gap 2: insurance_branch_mapping had RLS enabled but ZERO policies, so every read
--        returned empty. getFilteredBranches() silently fell back to "all branches",
--        disabling insurance-based branch filtering entirely.

-- ---------------------------------------------------------------------------
-- Gap 1: referral_status_updates -> check ALL branches
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "referral_status_updates_select" ON "public"."referral_status_updates";
DROP POLICY IF EXISTS "referral_status_updates_insert" ON "public"."referral_status_updates";

CREATE POLICY "referral_status_updates_select" ON "public"."referral_status_updates"
  FOR SELECT
  TO "authenticated"
  USING ((referral_id IN (
    SELECT referrals.id FROM public.referrals
    WHERE (referrals.branch_id = ANY(public.get_my_branch_ids()) OR public.can_see_all_branches())
  )) AND (public.get_my_role() = ANY (ARRAY['OFFICE'::public.user_role, 'CEO'::public.user_role])));

CREATE POLICY "referral_status_updates_insert" ON "public"."referral_status_updates"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((referral_id IN (
    SELECT referrals.id FROM public.referrals
    WHERE (referrals.branch_id = ANY(public.get_my_branch_ids()) OR public.can_see_all_branches())
  )) AND (public.get_my_role() = ANY (ARRAY['OFFICE'::public.user_role, 'CEO'::public.user_role]))
    AND (created_by = auth.uid()));

-- ---------------------------------------------------------------------------
-- Gap 2: insurance_branch_mapping -> readable by authenticated users
-- Reference data only (insurance_company -> branch_id). No sensitive content.
-- Read-only: writes stay blocked (no INSERT/UPDATE/DELETE policy).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "insurance_branch_mapping_select" ON "public"."insurance_branch_mapping";

CREATE POLICY "insurance_branch_mapping_select" ON "public"."insurance_branch_mapping"
  FOR SELECT
  TO "authenticated"
  USING (true);
