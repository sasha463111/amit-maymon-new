-- 035: Tracking column for the ENTER_WORK reminder cron.
--
-- Lets the reminder job be idempotent — "roughly every 2 hours" without a
-- precise scheduler triggering it exactly on the hour. See
-- src/app/api/cron/enter-work-reminders/route.ts.

ALTER TABLE cases ADD COLUMN IF NOT EXISTS painter_reminder_sent_at TIMESTAMPTZ;
