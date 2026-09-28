-- 024: Security hardening (from advisor + audit findings)

-- CRITICAL: drop credential-dumping helper left from the project migration.
-- It was SECURITY DEFINER, anon-executable, and returned all of auth.users
-- (including password hashes) + auth.identities.
DROP FUNCTION IF EXISTS public._export_auth();

-- notifications: was WITH CHECK (true) — forbid forging "from".
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (triggered_by = auth.uid());

-- audit_events: lock writer identity.
DROP POLICY IF EXISTS audit_events_insert ON public.audit_events;
CREATE POLICY audit_events_insert ON public.audit_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- painter_request_images: only the request creator (or CEO).
DROP POLICY IF EXISTS painter_request_images_insert ON public.painter_request_images;
CREATE POLICY painter_request_images_insert ON public.painter_request_images
  FOR INSERT TO authenticated WITH CHECK (
    request_id IN (SELECT id FROM public.painter_requests WHERE created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'CEO')
  );

-- painter_requests UPDATE: add branch isolation (was role-only → cross-branch IDOR).
DROP POLICY IF EXISTS painter_requests_update ON public.painter_requests;
CREATE POLICY painter_requests_update ON public.painter_requests
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'CEO')
    OR (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'SERVICE_MANAGER')
      AND case_id IN (
        SELECT c.id FROM public.cases c
        WHERE c.branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
      )
    )
  );

-- Pin search_path on storage helper; revoke anon EXECUTE on auth-required RPCs.
ALTER FUNCTION public._storage_case_id(text) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_push_subscription(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_my_push_subscription(text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_my_push_subscription(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public._storage_user_can_see_case(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public._storage_case_id(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_branch_id() FROM anon;
