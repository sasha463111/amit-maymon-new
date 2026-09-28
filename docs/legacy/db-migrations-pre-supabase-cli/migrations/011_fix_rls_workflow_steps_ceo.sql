-- Migration 011: Fix RLS INSERT policy for case_workflow_steps to allow CEO
-- CEO has branch_id = NULL so the branch_id IN (...) check always fails.
-- The existing case_workflow_steps_insert policy blocks CEO from inserting steps.
-- Solution: add additive policy allowing CEO to insert any workflow step.

DROP POLICY IF EXISTS case_workflow_steps_insert_ceo ON case_workflow_steps;
CREATE POLICY case_workflow_steps_insert_ceo ON case_workflow_steps
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
  );

-- Also allow creator of the case to insert steps (covers SERVICE_MANAGER edge cases)
DROP POLICY IF EXISTS case_workflow_steps_insert_creator ON case_workflow_steps;
CREATE POLICY case_workflow_steps_insert_creator ON case_workflow_steps
  FOR INSERT TO authenticated
  WITH CHECK (
    run_id IN (
      SELECT cwr.id FROM case_workflow_runs cwr
      JOIN cases c ON c.id = cwr.case_id
      WHERE c.created_by = auth.uid()
    )
  );
