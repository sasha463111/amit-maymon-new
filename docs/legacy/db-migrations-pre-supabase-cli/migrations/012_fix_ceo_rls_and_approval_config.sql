-- Migration 012: Fix CEO RLS INSERT policies + add requires_ceo_approval to workflow_step_templates
-- CEO has branch_id = NULL so branch_id IN (...) checks always fail for CEO

-- Fix case_workflow_runs INSERT: CEO needs to create closure workflow runs
DROP POLICY IF EXISTS case_workflow_runs_insert ON case_workflow_runs;
CREATE POLICY case_workflow_runs_insert ON case_workflow_runs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
    OR case_id IN (SELECT id FROM cases WHERE branch_id IN (SELECT branch_id FROM profiles WHERE id = auth.uid()))
  );

-- Fix ceo_approvals INSERT: CEO (and service managers) need to insert approvals when completing steps
DROP POLICY IF EXISTS ceo_approvals_insert ON ceo_approvals;
CREATE POLICY ceo_approvals_insert ON ceo_approvals FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
    OR case_id IN (SELECT id FROM cases WHERE branch_id IN (SELECT branch_id FROM profiles WHERE id = auth.uid()))
  );

-- Add requires_ceo_approval field to workflow_step_templates
ALTER TABLE workflow_step_templates
  ADD COLUMN IF NOT EXISTS requires_ceo_approval BOOLEAN NOT NULL DEFAULT FALSE;

-- Set WAIT_APPRAISER_APPROVAL as requiring CEO approval (matching current hardcoded logic)
UPDATE workflow_step_templates
  SET requires_ceo_approval = TRUE
  WHERE step_key = 'WAIT_APPRAISER_APPROVAL';
