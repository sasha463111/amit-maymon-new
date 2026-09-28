-- 018: Fix infinite recursion in RLS policies on profiles
--
-- Original issue: profiles_select_branch used a subquery on profiles itself,
-- which triggered RLS evaluation on the subquery, which tried
-- profiles_select_branch again → infinite recursion.
--
-- Fix: wrap the profile lookup in SECURITY DEFINER helper functions so RLS is
-- bypassed inside them, then use those helpers in policies instead of subqueries.

CREATE OR REPLACE FUNCTION public.current_user_branch_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT branch_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.current_user_branch_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

-- profiles
DROP POLICY IF EXISTS profiles_select_branch ON profiles;
CREATE POLICY profiles_select_branch ON profiles
  FOR SELECT TO authenticated
  USING (branch_id = public.current_user_branch_id());

-- cars
DROP POLICY IF EXISTS cars_select ON cars;
CREATE POLICY cars_select ON cars
  FOR SELECT TO authenticated
  USING (branch_id = public.current_user_branch_id() OR public.current_user_role() = 'CEO');

DROP POLICY IF EXISTS cars_insert ON cars;
CREATE POLICY cars_insert ON cars
  FOR INSERT TO authenticated
  WITH CHECK (branch_id = public.current_user_branch_id() OR public.current_user_role() = 'CEO');

DROP POLICY IF EXISTS cars_update ON cars;
CREATE POLICY cars_update ON cars
  FOR UPDATE TO authenticated
  USING (branch_id = public.current_user_branch_id() OR public.current_user_role() = 'CEO');

DROP POLICY IF EXISTS cars_select_ceo ON cars;

-- cases
DROP POLICY IF EXISTS cases_select ON cases;
CREATE POLICY cases_select ON cases
  FOR SELECT TO authenticated
  USING (branch_id = public.current_user_branch_id() OR public.current_user_role() = 'CEO');

DROP POLICY IF EXISTS cases_select_ceo ON cases;

DROP POLICY IF EXISTS cases_insert ON cases;
CREATE POLICY cases_insert ON cases
  FOR INSERT TO authenticated
  WITH CHECK (branch_id = public.current_user_branch_id() OR public.current_user_role() = 'CEO');

DROP POLICY IF EXISTS cases_update ON cases;
CREATE POLICY cases_update ON cases
  FOR UPDATE TO authenticated
  USING (branch_id = public.current_user_branch_id() OR public.current_user_role() = 'CEO');

-- case_workflow_runs
DROP POLICY IF EXISTS case_workflow_runs_select ON case_workflow_runs;
CREATE POLICY case_workflow_runs_select ON case_workflow_runs
  FOR SELECT TO authenticated
  USING (
    case_id IN (SELECT id FROM cases WHERE branch_id = public.current_user_branch_id())
    OR public.current_user_role() = 'CEO'
  );

DROP POLICY IF EXISTS case_workflow_runs_select_ceo ON case_workflow_runs;

-- case_workflow_steps
DROP POLICY IF EXISTS case_workflow_steps_select ON case_workflow_steps;
CREATE POLICY case_workflow_steps_select ON case_workflow_steps
  FOR SELECT TO authenticated
  USING (
    run_id IN (
      SELECT cwr.id FROM case_workflow_runs cwr
      JOIN cases c ON c.id = cwr.case_id
      WHERE c.branch_id = public.current_user_branch_id()
    )
    OR public.current_user_role() = 'CEO'
  );

DROP POLICY IF EXISTS case_workflow_steps_select_ceo ON case_workflow_steps;

-- ceo_approvals
DROP POLICY IF EXISTS ceo_approvals_select ON ceo_approvals;
CREATE POLICY ceo_approvals_select ON ceo_approvals
  FOR SELECT TO authenticated
  USING (
    case_id IN (SELECT id FROM cases WHERE branch_id = public.current_user_branch_id())
    OR public.current_user_role() = 'CEO'
  );

DROP POLICY IF EXISTS ceo_approvals_select_ceo ON ceo_approvals;

-- bodywork_extras
DROP POLICY IF EXISTS bodywork_extras_select ON bodywork_extras;
CREATE POLICY bodywork_extras_select ON bodywork_extras
  FOR SELECT TO authenticated
  USING (
    case_id IN (SELECT id FROM cases WHERE branch_id = public.current_user_branch_id())
    OR public.current_user_role() = 'CEO'
  );

DROP POLICY IF EXISTS bodywork_extras_select_ceo ON bodywork_extras;

-- audit_events
DROP POLICY IF EXISTS audit_events_select_ceo ON audit_events;
