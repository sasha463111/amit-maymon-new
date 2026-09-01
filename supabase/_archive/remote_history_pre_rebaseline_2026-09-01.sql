-- ============================================================================
-- ARCHIVE: supabase_migrations.schema_migrations contents BEFORE CLI re-baseline
-- ============================================================================
-- Captured: 2026-09-01, project yhanmyvolpeiuxspcxmk ("Amit maymon", ap-south-1)
-- Reason:   Adopting the Supabase CLI. The remote CLI migration-history table
--           held 20 entries (migrations ~016-029) that were applied via the
--           Supabase MCP `apply_migration` tool during past AI sessions
--           (all authored by sasha463111@gmail.com). Migrations 001-015 and
--           030-046 were NEVER recorded here (run manually in the SQL Editor).
--           `supabase db pull` refuses while local supabase/migrations/ is empty
--           but remote history is not, so we mark these 20 as reverted and pull
--           a single accurate baseline (<ts>_remote_schema.sql) instead.
--
-- IMPORTANT: This is a HISTORY-TABLE snapshot only. The actual production schema
--            (tables, RLS, functions, triggers) is unaffected by the re-baseline
--            and remains fully applied (001-046). Nothing here was un-applied
--            from the database - only the bookkeeping rows were cleared.
--
-- The numbered source files for these also live in src/db/migrations/016*..029*.
--
-- ----------------------------------------------------------------------------
-- TO RESTORE these 20 rows into supabase_migrations.schema_migrations (only if
-- you ever abandon the re-baseline and want the old partial history back):
-- run the INSERT block at the BOTTOM of this file.
-- ============================================================================


-- ====================  1) 20260402164119  016_appraiser_status  ====================
ALTER TABLE cases ADD COLUMN IF NOT EXISTS appraiser_status TEXT CHECK (appraiser_status IN ('APPROVED', 'NOT_APPROVED', 'WAITING_SETTLEMENT'));


-- ====================  2) 20260415193112  017_soft_delete_painter_requests_bodywork_advisors  ====================
-- =====================================================
-- Migration 017: soft delete, painter requests, bodywork advisors
-- =====================================================

-- 1. Soft delete columns on cases
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_cases_deleted_at ON cases(deleted_at) WHERE deleted_at IS NULL;

-- 2. Update cases_select RLS to exclude deleted for non-CEO users
DROP POLICY IF EXISTS cases_select ON cases;

CREATE POLICY cases_select ON cases
  FOR SELECT TO authenticated
  USING (
    (
      branch_id IN (SELECT branch_id FROM profiles WHERE id = auth.uid())
      AND deleted_at IS NULL
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
  );

-- CEO can also update deleted cases (for restore)
DROP POLICY IF EXISTS cases_update ON cases;
CREATE POLICY cases_update ON cases
  FOR UPDATE TO authenticated
  USING (
    branch_id IN (SELECT branch_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
  );

-- 3. Bodywork advisor flag on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_bodywork_advisor boolean NOT NULL DEFAULT false;

-- Set SERVICE_MANAGER and SERVICE_ADVISOR as bodywork advisors by default
UPDATE profiles SET is_bodywork_advisor = true
WHERE role IN ('SERVICE_MANAGER', 'SERVICE_ADVISOR');

-- 4. Painter requests table
CREATE TABLE IF NOT EXISTS painter_requests (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  description text NOT NULL,
  request_type text NOT NULL DEFAULT 'WORK',
  status text NOT NULL DEFAULT 'PENDING',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_painter_requests_case_id ON painter_requests(case_id);

ALTER TABLE painter_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY painter_requests_select ON painter_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cases c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = painter_requests.case_id
        AND (p.branch_id = c.branch_id OR p.role = 'CEO')
    )
  );

CREATE POLICY painter_requests_insert ON painter_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('PAINTER', 'SERVICE_MANAGER', 'CEO', 'SERVICE_ADVISOR', 'OFFICE')
    )
  );

CREATE POLICY painter_requests_update ON painter_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('SERVICE_MANAGER', 'CEO')
    )
  );

-- 5. Painter request images table
CREATE TABLE IF NOT EXISTS painter_request_images (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  request_id uuid NOT NULL REFERENCES painter_requests(id) ON DELETE CASCADE,
  image_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_painter_request_images_request_id ON painter_request_images(request_id);

ALTER TABLE painter_request_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY painter_request_images_select ON painter_request_images
  FOR SELECT TO authenticated USING (true);

CREATE POLICY painter_request_images_insert ON painter_request_images
  FOR INSERT TO authenticated WITH CHECK (true);

-- 6. Add document_type to case_documents
ALTER TABLE case_documents
  ADD COLUMN IF NOT EXISTS document_type text;

-- 7. Storage bucket for painter request images (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('painter-images', 'painter-images', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for painter-images bucket
DROP POLICY IF EXISTS "painter-images upload" ON storage.objects;
DROP POLICY IF EXISTS "painter-images read" ON storage.objects;

CREATE POLICY "painter-images upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'painter-images');

CREATE POLICY "painter-images read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'painter-images');


-- ====================  3) 20260517203718  session6_feedback_columns  ====================
-- 020: Session 6 feedback (re-apply to production — was missing)

-- 1. cases: ENTER_WORK sub-checklist + by-whom assignees
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS enter_work_checklist_state jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS catalog_numbers_assignee text,
  ADD COLUMN IF NOT EXISTS parts_discounts_assignee text,
  ADD COLUMN IF NOT EXISTS completion_photos_assignee text;

-- 2. notifications: triggered_by + action_url
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS triggered_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS action_url text;

-- 3. ceo_approvals: dedupe + unique index
DELETE FROM ceo_approvals a
USING ceo_approvals b
WHERE a.case_id = b.case_id
  AND a.approval_type = b.approval_type
  AND a.id <> b.id
  AND a.created_at < b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ceo_approvals_case_type
  ON ceo_approvals(case_id, approval_type);


-- ====================  4) 20260517205756  push_subscriptions  ====================
-- 021: Web Push subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select ON push_subscriptions;
CREATE POLICY push_subscriptions_select ON push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO'));

DROP POLICY IF EXISTS push_subscriptions_insert ON push_subscriptions;
CREATE POLICY push_subscriptions_insert ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_delete ON push_subscriptions;
CREATE POLICY push_subscriptions_delete ON push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO'));


-- ====================  5) 20260519080022  push_subscriptions_update_policy  ====================
-- Allow upsert (insert + update) of own subscription rows.
-- Without UPDATE policy, upsert on conflict silently fails.
DROP POLICY IF EXISTS push_subscriptions_update ON push_subscriptions;
CREATE POLICY push_subscriptions_update ON push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ====================  6) 20260526102103  push_subscription_update_policy_harden  ====================
DROP POLICY IF EXISTS push_subscriptions_update ON push_subscriptions;
CREATE POLICY push_subscriptions_update ON push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';


-- ====================  7) 20260601120945  force_postgrest_cache_reload  ====================
-- Apply a no-op DDL inside a migration. apply_migration triggers Supabase's
-- internal hook chain which is more reliable at invalidating the PostgREST
-- cache than a bare NOTIFY (which depends on the pgrst worker being listening
-- on the right session).

-- Re-declare the table with a no-op alter to bump the DDL version.
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS _cache_bust_marker TEXT;
ALTER TABLE public.push_subscriptions
  DROP COLUMN IF EXISTS _cache_bust_marker;

-- Re-apply grants in case they were lost during any earlier wobble.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO service_role;
GRANT USAGE ON SCHEMA public TO authenticated;

-- And a final cache-bust signal.
NOTIFY pgrst, 'reload schema';


-- ====================  8) 20260601121420  push_subscriptions_replica_safe_recreate  ====================
-- The PostgREST cache stays stale across replicas even after NOTIFY.
-- Drop + recreate the view of the table through a real DDL change so that
-- every replica re-introspects on its next request.

-- Step 1: Drop the policies, recreate the table contract (no data loss — table
-- has 0 rows). DROP+CREATE forces a definite cache miss.
DROP TABLE IF EXISTS public.push_subscriptions CASCADE;

CREATE TABLE public.push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_select ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
  );

CREATE POLICY push_subscriptions_insert ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY push_subscriptions_update ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY push_subscriptions_delete ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO service_role;

NOTIFY pgrst, 'reload schema';


-- ====================  9) 20260601121523  save_push_subscription_rpc  ====================
-- RPC function for upserting push subscriptions. RPC goes through PostgREST's
-- /rpc/ endpoint which doesn't depend on the table-schema cache the same way
-- table queries do, and SECURITY DEFINER lets the function run with elevated
-- privileges regardless of whether the table cache is fresh on the replica
-- handling this request.

CREATE OR REPLACE FUNCTION public.save_push_subscription(
  p_endpoint   TEXT,
  p_p256dh     TEXT,
  p_auth       TEXT,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, last_used_at)
  VALUES (v_user_id, p_endpoint, p_p256dh, p_auth, p_user_agent, now())
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        last_used_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- And a delete companion.
CREATE OR REPLACE FUNCTION public.remove_push_subscription(p_endpoint TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  DELETE FROM public.push_subscriptions
  WHERE endpoint = p_endpoint AND user_id = v_user_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_push_subscription(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_push_subscription(TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';


-- ====================  10) 20260601160313  profiles_push_subscriptions_jsonb  ====================
-- Add push_subscriptions array column to profiles. Working around a Supabase
-- Cloud regional cache issue where push_subscriptions table is unknown to
-- the PostgREST replica that handles Vercel-fra1 traffic.
-- The profiles table is known to that replica (it's been there for months),
-- so writes to a JSONB column on profiles always succeed.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_subscriptions JSONB NOT NULL DEFAULT '[]'::jsonb;

-- RPC: append or upsert a subscription by endpoint into profiles.push_subscriptions.
CREATE OR REPLACE FUNCTION public.upsert_my_push_subscription(
  p_endpoint   TEXT,
  p_p256dh     TEXT,
  p_auth       TEXT,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing JSONB;
  v_new_sub JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_new_sub := jsonb_build_object(
    'endpoint',   p_endpoint,
    'p256dh',     p_p256dh,
    'auth',       p_auth,
    'user_agent', p_user_agent,
    'updated_at', extract(epoch FROM now())
  );

  SELECT COALESCE(
    (SELECT jsonb_agg(s)
     FROM jsonb_array_elements(push_subscriptions) s
     WHERE s->>'endpoint' <> p_endpoint),
    '[]'::jsonb
  ) || jsonb_build_array(v_new_sub)
  INTO v_existing
  FROM public.profiles
  WHERE id = v_user_id;

  UPDATE public.profiles
  SET push_subscriptions = v_existing
  WHERE id = v_user_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_my_push_subscription(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_my_push_subscription(TEXT, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.remove_my_push_subscription(p_endpoint TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  UPDATE public.profiles
  SET push_subscriptions = COALESCE(
    (SELECT jsonb_agg(s) FROM jsonb_array_elements(push_subscriptions) s
     WHERE s->>'endpoint' <> p_endpoint),
    '[]'::jsonb
  )
  WHERE id = v_user_id;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_my_push_subscription(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_my_push_subscription(TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';


-- ====================  11) 20260603210110  storage_branch_scoped_rls_v2  ====================
-- Helper functions in public schema (we can't write to storage schema).
CREATE OR REPLACE FUNCTION public._storage_case_id(name text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(split_part(name, '/', 1), '')::uuid
$$;

CREATE OR REPLACE FUNCTION public._storage_user_can_see_case(case_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cases c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = case_id
      AND (p.role = 'CEO' OR p.branch_id = c.branch_id)
  )
$$;

GRANT EXECUTE ON FUNCTION public._storage_case_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._storage_user_can_see_case(uuid) TO authenticated;

DROP POLICY IF EXISTS "case-documents read"   ON storage.objects;
DROP POLICY IF EXISTS "case-documents upload" ON storage.objects;
DROP POLICY IF EXISTS "case-documents delete" ON storage.objects;
DROP POLICY IF EXISTS "painter-images read"   ON storage.objects;
DROP POLICY IF EXISTS "painter-images upload" ON storage.objects;
DROP POLICY IF EXISTS "extras-images read"    ON storage.objects;
DROP POLICY IF EXISTS "extras-images upload"  ON storage.objects;

CREATE POLICY "case-documents read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'case-documents' AND public._storage_user_can_see_case(public._storage_case_id(name)));

CREATE POLICY "case-documents upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'case-documents' AND public._storage_user_can_see_case(public._storage_case_id(name)));

CREATE POLICY "case-documents delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'case-documents' AND public._storage_user_can_see_case(public._storage_case_id(name)));

CREATE POLICY "painter-images read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'painter-images' AND public._storage_user_can_see_case(public._storage_case_id(name)));

CREATE POLICY "painter-images upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'painter-images' AND public._storage_user_can_see_case(public._storage_case_id(name)));

CREATE POLICY "extras-images read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'extras-images' AND public._storage_user_can_see_case(public._storage_case_id(name)));

CREATE POLICY "extras-images upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'extras-images' AND public._storage_user_can_see_case(public._storage_case_id(name)));


-- ====================  12) 20260603210906  closure_workflow_uniqueness  ====================
-- Prevent CLOSURE workflow race: two concurrent SEND_COMPLETION_PHOTOS
-- completions can both pass the existence check and create duplicate closure
-- runs. Add a partial unique index so the second concurrent insert just fails
-- cleanly, and the calling code can treat the conflict as "already created".
CREATE UNIQUE INDEX IF NOT EXISTS uniq_case_workflow_runs_one_closure_per_case
  ON public.case_workflow_runs (case_id)
  WHERE workflow_type = 'CLOSURE';


-- ====================  13) 20260610202314  harden_rls_and_security_definer  ====================
-- ============================================================================
-- Security hardening pass (from advisor findings)
-- ============================================================================

-- 1. notifications: was WITH CHECK (true) — any authenticated user could insert
--    a notification on anyone's behalf with forged "from". Tighten so the
--    triggered_by must be the caller. Every server-action insert sets
--    triggered_by = user.id, so this doesn't break legit flows.
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (triggered_by = auth.uid());

-- 2. audit_events: append-only log written by server actions with the acting
--    user's JWT. Lock the writer identity. System events (user_id null) allowed.
DROP POLICY IF EXISTS audit_events_insert ON public.audit_events;
CREATE POLICY audit_events_insert ON public.audit_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- 3. painter_request_images: only the request's creator (the painter) — or CEO —
--    may attach images, matching how the upload code namespaces by request.
DROP POLICY IF EXISTS painter_request_images_insert ON public.painter_request_images;
CREATE POLICY painter_request_images_insert ON public.painter_request_images
  FOR INSERT TO authenticated
  WITH CHECK (
    request_id IN (SELECT id FROM public.painter_requests WHERE created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'CEO')
  );

-- 4. Pin search_path on the storage helper that lacked it (SECURITY DEFINER
--    functions with mutable search_path are an injection surface).
ALTER FUNCTION public._storage_case_id(text) SET search_path = public;

-- 5. Defense-in-depth: revoke EXECUTE from anon on functions that already
--    require an authenticated session internally. They return null/false for
--    anon today, but there's no reason to expose them to anon at all.
REVOKE EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_push_subscription(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_my_push_subscription(text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_my_push_subscription(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public._storage_user_can_see_case(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public._storage_case_id(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_branch_id() FROM anon;


-- ====================  14) 20260610202739  fix_painter_request_branch_isolation  ====================
-- P1: painter_requests_update was role-only (SERVICE_MANAGER/CEO) with no branch
-- scope — a manager in Netivot could flip the status of an Ashkelon request by
-- enumerating IDs. Add branch isolation matching the rest of the app.
DROP POLICY IF EXISTS painter_requests_update ON public.painter_requests;
CREATE POLICY painter_requests_update ON public.painter_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'CEO')
    OR (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'SERVICE_MANAGER')
      AND case_id IN (
        SELECT c.id FROM public.cases c
        WHERE c.branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
      )
    )
  );


-- ====================  15) 20260610203249  pin_remaining_search_paths  ====================
-- Clear the remaining function_search_path_mutable warnings on legacy functions.
ALTER FUNCTION public.get_my_branch_id() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public, auth;


-- ====================  16) 20260610203612  add_hot_path_fk_indexes  ====================
-- Covering indexes for the foreign keys hit on every notification-bell render,
-- case-timeline render, and "by whom" name join. Cheap, zero-risk, removes the
-- advisor's unindexed-FK warnings on the hot paths.
CREATE INDEX IF NOT EXISTS idx_notifications_case_id ON public.notifications(case_id);
CREATE INDEX IF NOT EXISTS idx_notifications_triggered_by ON public.notifications(triggered_by);
CREATE INDEX IF NOT EXISTS idx_audit_events_user_id ON public.audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_case_workflow_steps_completed_by ON public.case_workflow_steps(completed_by);
CREATE INDEX IF NOT EXISTS idx_ceo_approvals_decided_by ON public.ceo_approvals(decided_by);
CREATE INDEX IF NOT EXISTS idx_bodywork_extras_created_by ON public.bodywork_extras(created_by);
CREATE INDEX IF NOT EXISTS idx_painter_requests_created_by ON public.painter_requests(created_by);
CREATE INDEX IF NOT EXISTS idx_case_documents_uploaded_by ON public.case_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_cases_created_by ON public.cases(created_by);
CREATE INDEX IF NOT EXISTS idx_cases_deleted_by ON public.cases(deleted_by);


-- ====================  17) 20260614093502  026_fix_profiles_select_ceo_visibility_for_notifications  ====================
-- Root cause of "no in-app notifications": notification recipient lookups in the
-- server actions query public.profiles to find who to notify. The profiles_select
-- RLS policy was ((id = auth.uid()) OR (branch_id = get_my_branch_id())) with NO
-- CEO bypass. Because the CEO has branch_id = NULL, get_my_branch_id() is NULL and
-- the CEO could see ONLY their own row -> every CEO-triggered notification found
-- zero recipients. Symmetrically, branch staff could not see CEO profiles (CEOs
-- have NULL branch), so notifyCeosPendingApproval (SELECT ... WHERE role='CEO')
-- found zero CEOs -> no approval notifications. The inserts were always fine; the
-- recipient list was always empty.

-- Recursion-safe role helper (mirrors get_my_branch_id: SECURITY DEFINER so the
-- policy doesn't re-trigger RLS on profiles).
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1; $$;

REVOKE ALL ON FUNCTION public.get_my_role() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- Restore CEO bypass + make CEO profiles visible to all authenticated users
-- (required so branch staff can resolve CEOs as notification recipients).
-- Same-branch visibility is preserved; cross-branch isolation otherwise intact.
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR role = 'CEO'                       -- staff must see CEOs to notify them
    OR public.get_my_role() = 'CEO'       -- CEO sees everyone (no branch)
    OR branch_id = public.get_my_branch_id()
  );


-- ====================  18) 20260614133650  027_ceo_receives_all_notifications  ====================
-- The CEO must receive EVERY in-app notification, always — for all current and
-- future notification types, without having to remember to add CEOs at each
-- emit site. A single AFTER INSERT trigger fans out every notification to all
-- active CEOs, with:
--   * a recursion guard (copies target CEOs and are not fanned out again), and
--   * a dedup so an event that notifies N non-CEO recipients still yields exactly
--     ONE copy per CEO (matched on case_id + type + title + triggered_by within 5m).
-- A CEO is not notified about their own action (triggered_by = that CEO).

CREATE OR REPLACE FUNCTION public.fanout_notifications_to_ceos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE id = NEW.user_id AND role = 'CEO') THEN
    RETURN NEW;
  END IF;
  INSERT INTO notifications (user_id, case_id, type, title, body, action_url, triggered_by, read)
  SELECT p.id, NEW.case_id, NEW.type, NEW.title, NEW.body, NEW.action_url, NEW.triggered_by, false
  FROM profiles p
  WHERE p.role = 'CEO' AND p.is_active = true
    AND (NEW.triggered_by IS NULL OR p.id <> NEW.triggered_by)
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = p.id
        AND n.case_id IS NOT DISTINCT FROM NEW.case_id
        AND n.type = NEW.type AND n.title = NEW.title
        AND n.triggered_by IS NOT DISTINCT FROM NEW.triggered_by
        AND n.created_at > now() - interval '5 minutes'
    );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fanout_notifications_to_ceos ON notifications;
CREATE TRIGGER trg_fanout_notifications_to_ceos
  AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION public.fanout_notifications_to_ceos();


-- ====================  19) 20260614215134  028_cross_branch_access_flag  ====================
-- Some staff (reception/office + service advisors) must work across BOTH
-- branches, which until now only the CEO could. Add an opt-in per-user flag
-- `sees_all_branches` and fold it into every branch-scoped RLS policy via a
-- recursion-safe helper, without changing any existing branch logic.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sees_all_branches boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.can_see_all_branches()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'CEO' OR sees_all_branches = true)); $$;
REVOKE ALL ON FUNCTION public.can_see_all_branches() FROM public;
GRANT EXECUTE ON FUNCTION public.can_see_all_branches() TO authenticated;

-- Programmatically OR `can_see_all_branches()` into every branch-scoped policy's
-- USING / WITH CHECK expression. Preserves the exact existing predicate; only
-- adds the cross-branch grant. Idempotent (skips policies already wrapped).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, pol.polname AS name,
           pg_get_expr(pol.polqual, pol.polrelid) AS u,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS w
    FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
    WHERE c.relnamespace = 'public'::regnamespace
      AND (pg_get_expr(pol.polqual, pol.polrelid) ILIKE '%branch%'
        OR pg_get_expr(pol.polwithcheck, pol.polrelid) ILIKE '%branch%')
  LOOP
    IF r.u IS NOT NULL AND position('can_see_all_branches' in r.u) = 0 THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING ((%s) OR public.can_see_all_branches())', r.name, r.tbl, r.u);
    END IF;
    IF r.w IS NOT NULL AND position('can_see_all_branches' in r.w) = 0 THEN
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK ((%s) OR public.can_see_all_branches())', r.name, r.tbl, r.w);
    END IF;
  END LOOP;
END $$;


-- ====================  20) 20260617073107  029_notifications_realtime  ====================
-- In-app notifications were only picked up by a 10s poll (and not at all while
-- the app was backgrounded), causing a large perceived delay. Add the
-- notifications table to the Realtime publication so the bell can subscribe and
-- update instantly. RLS (notifications_select: user_id = auth.uid()) still scopes
-- which change events each client receives.
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;


-- ============================================================================
-- RESTORE BLOCK — re-insert the 20 history rows (only if abandoning re-baseline)
-- ============================================================================
-- INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
--   ('20260402164119', '016_appraiser_status', ARRAY[$stmt$...$stmt$]),
--   ... (reconstruct from the sections above; statements are single-element arrays) ...
-- ON CONFLICT (version) DO NOTHING;
--
-- In practice you will not need this: the schema these produced is already live,
-- and the new baseline <ts>_remote_schema.sql captures the full current state.
