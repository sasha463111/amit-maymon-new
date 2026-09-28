-- 043: Referral follow-up date + reminder.
--
-- Explicit request: be able to set a date on a referral ("לקוח תואם לשבוע
-- הבא לתאריך מסוים") and get a reminder to reach out to the customer on
-- that date. Converting the referral to a case before the date arrives
-- (already-existing "צור תיק מהפנייה" flow) needs no extra handling here —
-- convertReferral already flips status to CONVERTED, and the reminder sweep
-- below only ever looks at status='ACTIVE' referrals, so a converted
-- referral silently stops being a candidate.

ALTER TABLE referrals ADD COLUMN IF NOT EXISTS follow_up_date DATE;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS follow_up_reminder_sent_at TIMESTAMPTZ;

INSERT INTO schema_migrations (filename) VALUES ('043_referral_followup_date.sql')
ON CONFLICT (filename) DO NOTHING;
