-- Add "create_referral" as the ninth delegatable permission
--
-- Opening a referral was hard-coded to OFFICE / CEO in both referrals.ts and
-- the RLS policies, and was absent from the permission matrix entirely — so the
-- CEO had no way to let a service manager or service advisor open one. This was
-- a real operational gap: נסיה and ערן were reported as unable to open
-- referrals, and there was no setting anywhere that could change it.
--
-- Defaults preserve today's behaviour exactly (OFFICE + CEO only). The CEO can
-- now grant it to other roles from Settings > Permissions.

INSERT INTO public.role_permissions (role, action, enabled) VALUES
  ('CEO',              'create_referral', true),
  ('OFFICE',           'create_referral', true),
  ('SERVICE_MANAGER',  'create_referral', false),
  ('SERVICE_ADVISOR',  'create_referral', false),
  ('PAINTER',          'create_referral', false)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS follows the matrix.
--
-- All four policies move together on purpose: a role granted create_referral
-- must also be able to see, update and delete the referrals it works with,
-- otherwise it could create a referral and then not find it. Branch isolation
-- stays hard-coded — the matrix decides WHICH ROLES, never WHICH BRANCHES.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "referrals_insert" ON "public"."referrals";
DROP POLICY IF EXISTS "referrals_select" ON "public"."referrals";
DROP POLICY IF EXISTS "referrals_update" ON "public"."referrals";
DROP POLICY IF EXISTS "referrals_delete" ON "public"."referrals";

CREATE POLICY "referrals_insert" ON "public"."referrals"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    public.has_permission('create_referral')
    AND (public.get_my_role() = 'CEO'::public.user_role
         OR branch_id = ANY (public.get_my_branch_ids()))
  );

CREATE POLICY "referrals_select" ON "public"."referrals"
  FOR SELECT TO "authenticated"
  USING (
    public.has_permission('create_referral')
    AND (public.get_my_role() = 'CEO'::public.user_role
         OR public.can_see_all_branches()
         OR branch_id = ANY (public.get_my_branch_ids()))
  );

CREATE POLICY "referrals_update" ON "public"."referrals"
  FOR UPDATE TO "authenticated"
  USING (
    public.has_permission('create_referral')
    AND (public.get_my_role() = 'CEO'::public.user_role
         OR branch_id = ANY (public.get_my_branch_ids()))
  );

CREATE POLICY "referrals_delete" ON "public"."referrals"
  FOR DELETE TO "authenticated"
  USING (
    public.has_permission('create_referral')
    AND (public.get_my_role() = 'CEO'::public.user_role
         OR branch_id = ANY (public.get_my_branch_ids()))
  );

-- ---------------------------------------------------------------------------
-- Dependent tables move with it.
--
-- referral_documents and referral_status_updates both hard-coded
-- get_my_role() IN ('OFFICE','CEO'). Left alone, a newly-granted role could
-- open a referral but then fail to attach a document or log a follow-up to it —
-- a half-granted permission, which is worse than not granting it at all.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "referral_documents_insert" ON "public"."referral_documents";
DROP POLICY IF EXISTS "referral_documents_select" ON "public"."referral_documents";
DROP POLICY IF EXISTS "referral_documents_delete" ON "public"."referral_documents";

CREATE POLICY "referral_documents_select" ON "public"."referral_documents"
  FOR SELECT TO "authenticated"
  USING (
    referral_id IN (
      SELECT r.id FROM public.referrals r
      WHERE r.branch_id = ANY (public.get_my_branch_ids()) OR public.can_see_all_branches()
    )
    AND public.has_permission('create_referral')
  );

CREATE POLICY "referral_documents_insert" ON "public"."referral_documents"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    referral_id IN (
      SELECT r.id FROM public.referrals r
      WHERE r.branch_id = ANY (public.get_my_branch_ids()) OR public.can_see_all_branches()
    )
    AND public.has_permission('create_referral')
    AND uploaded_by = auth.uid()
  );

-- Removing a file you uploaded yourself stays outside the matrix, matching the
-- same rule already applied to case documents.
CREATE POLICY "referral_documents_delete" ON "public"."referral_documents"
  FOR DELETE TO "authenticated"
  USING (
    uploaded_by = auth.uid()
    OR public.has_permission('create_referral')
  );

DROP POLICY IF EXISTS "referral_status_updates_insert" ON "public"."referral_status_updates";
DROP POLICY IF EXISTS "referral_status_updates_select" ON "public"."referral_status_updates";

CREATE POLICY "referral_status_updates_select" ON "public"."referral_status_updates"
  FOR SELECT TO "authenticated"
  USING (
    referral_id IN (
      SELECT r.id FROM public.referrals r
      WHERE r.branch_id = ANY (public.get_my_branch_ids()) OR public.can_see_all_branches()
    )
    AND public.has_permission('create_referral')
  );

CREATE POLICY "referral_status_updates_insert" ON "public"."referral_status_updates"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    referral_id IN (
      SELECT r.id FROM public.referrals r
      WHERE r.branch_id = ANY (public.get_my_branch_ids()) OR public.can_see_all_branches()
    )
    AND public.has_permission('create_referral')
    AND created_by = auth.uid()
  );
