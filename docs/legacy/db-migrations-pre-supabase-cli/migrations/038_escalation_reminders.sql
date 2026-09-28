-- 038: Gating timestamps for the two new 1-hour escalation reminders
-- (painter requests unanswered by an advisor, cases waiting on office to
-- start closure) — same idempotent-resend pattern as painter_reminder_sent_at
-- (027/035): null or stale means "due", set on send so the next cron tick
-- doesn't immediately re-fire.

ALTER TABLE painter_requests ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS office_reminder_sent_at TIMESTAMPTZ;

INSERT INTO schema_migrations (filename) VALUES ('038_escalation_reminders.sql')
ON CONFLICT (filename) DO NOTHING;
