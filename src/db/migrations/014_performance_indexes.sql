-- 014: Performance indexes for common query patterns

-- case_workflow_runs: filtered by case_id + workflow_type + status
CREATE INDEX IF NOT EXISTS idx_workflow_runs_case_type
  ON case_workflow_runs (case_id, workflow_type, status);

-- case_workflow_steps: filtered by run_id (most frequent access)
CREATE INDEX IF NOT EXISTS idx_workflow_steps_run_id
  ON case_workflow_steps (run_id, order_index);

-- cases: filtering open cases by branch
CREATE INDEX IF NOT EXISTS idx_cases_branch_closed
  ON cases (branch_id, closed_at);

-- cases: general_status filter
CREATE INDEX IF NOT EXISTS idx_cases_general_status
  ON cases (general_status) WHERE closed_at IS NULL;

-- notifications: user feed query
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- notifications: unread count
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON notifications (user_id, read) WHERE read = false;

-- ceo_approvals: by case
CREATE INDEX IF NOT EXISTS idx_ceo_approvals_case_id
  ON ceo_approvals (case_id, status);

-- bodywork_extras: blocking check
CREATE INDEX IF NOT EXISTS idx_bodywork_extras_case_status
  ON bodywork_extras (case_id, status);

-- audit_events: entity lookup
CREATE INDEX IF NOT EXISTS idx_audit_events_entity
  ON audit_events (entity_type, entity_id, created_at DESC);
