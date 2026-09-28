-- 045: Backfill referral_status_updates from the old free-text status_note.
--
-- Real bug found in production testing: the referral detail page let staff
-- edit status_note directly in a standalone box, separate from the new
-- "מעקב הפנייה" tag+log section added in migration 042. Amit filled in
-- status_note directly (natural — it's the field labeled "status"), so
-- current_status_tag never got set and the card never colored yellow, and
-- the log showed "no updates yet" even though there clearly was one. Fixed
-- in code by removing the standalone editable field — from now on every
-- status_note write goes through addReferralStatusUpdate, which keeps both
-- in sync. This migration backfills the one row (or more) that already has
-- a status_note but no log entry, so its history isn't silently lost.

INSERT INTO referral_status_updates (referral_id, status_tag, note, created_by, created_at)
SELECT r.id, NULL, r.status_note, r.created_by, r.created_at
FROM referrals r
WHERE r.status_note IS NOT NULL
  AND trim(r.status_note) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM referral_status_updates u WHERE u.referral_id = r.id
  );

INSERT INTO schema_migrations (filename) VALUES ('045_referral_status_note_backfill.sql')
ON CONFLICT (filename) DO NOTHING;
