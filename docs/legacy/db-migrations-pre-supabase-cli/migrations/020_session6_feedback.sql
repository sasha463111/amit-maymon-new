-- 020: Session 6 feedback (Amit) — new step metadata, notifications enrichment, approval uniqueness.

-- ============================================================================
-- 1. cases: ENTER_WORK sub-checklist + by-whom assignees
-- ============================================================================

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS enter_work_checklist_state jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS catalog_numbers_assignee text,
  ADD COLUMN IF NOT EXISTS parts_discounts_assignee text,
  ADD COLUMN IF NOT EXISTS completion_photos_assignee text;

-- ============================================================================
-- 2. notifications: triggered_by + action_url
-- ============================================================================

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS triggered_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS action_url text;

-- ============================================================================
-- 3. ceo_approvals: prevent duplicate (case_id, approval_type) pairs
-- ============================================================================

-- Cleanup duplicates first: keep the most recent per (case_id, approval_type)
DELETE FROM ceo_approvals a
USING ceo_approvals b
WHERE a.case_id = b.case_id
  AND a.approval_type = b.approval_type
  AND a.id <> b.id
  AND a.created_at < b.created_at;

-- Add unique index
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ceo_approvals_case_type
  ON ceo_approvals(case_id, approval_type);

-- ============================================================================
-- 4. case_documents: support FINAL_ESTIMATE document_type (already exists as text — no change needed).
-- ============================================================================
-- document_type is already text; no enum constraint to update. We just start
-- using 'FINAL_ESTIMATE' as a value from the application code.
