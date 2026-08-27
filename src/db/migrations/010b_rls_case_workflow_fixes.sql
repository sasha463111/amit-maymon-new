-- Migration 010: RLS fixes for case creation and workflow step completion
-- 1) Allow inserting case_workflow_runs when the case was just created by the current user
--    (fixes "new row violates row-level security policy for table case_workflow_runs")
-- 2) Allow CEO to update case_workflow_runs and case_workflow_steps (branch_id may be null for CEO)

-- case_workflow_runs: INSERT for case creator (so createCase can add the run after inserting case)
CREATE POLICY case_workflow_runs_insert_creator ON case_workflow_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    case_id IN (SELECT id FROM cases WHERE created_by = auth.uid())
  );

-- case_workflow_runs: UPDATE for CEO (e.g. when completing run)
CREATE POLICY case_workflow_runs_update_ceo ON case_workflow_runs
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO'));

-- case_workflow_steps: UPDATE for CEO (so CEO can complete steps)
CREATE POLICY case_workflow_steps_update_ceo ON case_workflow_steps
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO'));
