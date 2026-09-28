-- 044: WHEELS_CHECK no longer requires a CEO approval.
--
-- Explicit request (2026-08-31): Amit doesn't want to be asked to approve
-- wheel-check forms in /approvals — a plain FYI notification when the step
-- is completed is enough. ESTIMATE_AND_DETAILS stays the only approval that
-- actually blocks anything (see workflow.ts). The app already stopped
-- creating new WHEELS_CHECK ceo_approvals rows as of this same change; this
-- migration just clears out any that are already sitting PENDING in
-- production so they don't keep nagging him. The approval_type enum value
-- itself is left in place (same precedent as CASE_CLOSURE, unused since
-- Session 6) — old rows stay for history, just no longer PENDING.

UPDATE ceo_approvals
SET status = 'APPROVED', decided_at = now()
WHERE approval_type = 'WHEELS_CHECK' AND status = 'PENDING';

INSERT INTO schema_migrations (filename) VALUES ('044_wheels_check_no_approval_gate.sql')
ON CONFLICT (filename) DO NOTHING;
