-- Fix referral_documents RLS policies to check ALL branches, not just first
--
-- Root cause: The referral_documents_insert and referral_documents_select policies
-- were using get_my_branch_id() which only returns the FIRST branch from branch_ids array.
--
-- This meant users with multiple branches could NOT upload/view documents for
-- referrals created in their SECOND or later branches, even though they had access.
--
-- Fix: Change to get_my_branch_ids() with ANY operator to check all branches:
--   OLD: branch_id = get_my_branch_id()
--   NEW: branch_id = ANY(get_my_branch_ids())
--
-- Impact: File uploads were failing when the referral was not in the user's first branch.

DROP POLICY "referral_documents_insert" ON "public"."referral_documents";
DROP POLICY "referral_documents_select" ON "public"."referral_documents";

CREATE POLICY "referral_documents_insert" ON "public"."referral_documents"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((referral_id IN (
    SELECT referrals.id FROM public.referrals
    WHERE (referrals.branch_id = ANY(public.get_my_branch_ids()) OR public.can_see_all_branches())
  )) AND (public.get_my_role() = ANY (ARRAY['OFFICE'::public.user_role, 'CEO'::public.user_role])) AND (uploaded_by = auth.uid()));

CREATE POLICY "referral_documents_select" ON "public"."referral_documents"
  FOR SELECT
  TO "authenticated"
  USING ((referral_id IN (
    SELECT referrals.id FROM public.referrals
    WHERE (referrals.branch_id = ANY(public.get_my_branch_ids()) OR public.can_see_all_branches())
  )) AND (public.get_my_role() = ANY (ARRAY['OFFICE'::public.user_role, 'CEO'::public.user_role])));
