-- Migration 008: Update workflow steps for active cases
-- Removes SUMMARIZE_ESTIMATE, adds 3 new steps (ISSUE_CATALOG_NUMBERS, PARTS_DISCOUNTS, SEND_COMPLETION_PHOTOS)
-- Re-orders steps to match new workflow

-- Step 1: Remove SUMMARIZE_ESTIMATE steps entirely
DELETE FROM case_workflow_steps WHERE step_key = 'SUMMARIZE_ESTIMATE';

-- Step 2: Shift affected steps up by +100 to avoid index conflicts during migration
UPDATE case_workflow_steps
SET order_index = order_index + 100
WHERE step_key IN ('SEND_TO_APPRAISER', 'WAIT_APPRAISER_APPROVAL', 'ENTER_WORK', 'QUALITY_CONTROL', 'WASH', 'READY_FOR_OFFICE');

-- Step 3: Set final order_index values for all professional workflow steps
UPDATE case_workflow_steps SET order_index = 0 WHERE step_key = 'OPEN_CASE';
UPDATE case_workflow_steps SET order_index = 1 WHERE step_key = 'FIXCAR_PHOTOS';
UPDATE case_workflow_steps SET order_index = 2 WHERE step_key = 'WHEELS_CHECK';
UPDATE case_workflow_steps SET order_index = 3 WHERE step_key = 'PREP_ESTIMATE';
UPDATE case_workflow_steps SET order_index = 4 WHERE step_key = 'SEND_TO_APPRAISER';
UPDATE case_workflow_steps SET order_index = 5 WHERE step_key = 'WAIT_APPRAISER_APPROVAL';
UPDATE case_workflow_steps SET order_index = 6 WHERE step_key = 'ENTER_WORK';
UPDATE case_workflow_steps SET order_index = 9 WHERE step_key = 'QUALITY_CONTROL';
UPDATE case_workflow_steps SET order_index = 10 WHERE step_key = 'WASH';
UPDATE case_workflow_steps SET order_index = 12 WHERE step_key = 'READY_FOR_OFFICE';

-- Step 4: Insert new steps (ISSUE_CATALOG_NUMBERS) for active professional runs
INSERT INTO case_workflow_steps (run_id, step_key, state, order_index)
SELECT r.id, 'ISSUE_CATALOG_NUMBERS', 'PENDING', 7
FROM case_workflow_runs r
WHERE r.status = 'ACTIVE' AND r.workflow_type = 'PROFESSIONAL'
  AND NOT EXISTS (
    SELECT 1 FROM case_workflow_steps cs
    WHERE cs.run_id = r.id AND cs.step_key = 'ISSUE_CATALOG_NUMBERS'
  );

-- Step 5: Insert new steps (PARTS_DISCOUNTS)
INSERT INTO case_workflow_steps (run_id, step_key, state, order_index)
SELECT r.id, 'PARTS_DISCOUNTS', 'PENDING', 8
FROM case_workflow_runs r
WHERE r.status = 'ACTIVE' AND r.workflow_type = 'PROFESSIONAL'
  AND NOT EXISTS (
    SELECT 1 FROM case_workflow_steps cs
    WHERE cs.run_id = r.id AND cs.step_key = 'PARTS_DISCOUNTS'
  );

-- Step 6: Insert new steps (SEND_COMPLETION_PHOTOS)
INSERT INTO case_workflow_steps (run_id, step_key, state, order_index)
SELECT r.id, 'SEND_COMPLETION_PHOTOS', 'PENDING', 11
FROM case_workflow_runs r
WHERE r.status = 'ACTIVE' AND r.workflow_type = 'PROFESSIONAL'
  AND NOT EXISTS (
    SELECT 1 FROM case_workflow_steps cs
    WHERE cs.run_id = r.id AND cs.step_key = 'SEND_COMPLETION_PHOTOS'
  );
