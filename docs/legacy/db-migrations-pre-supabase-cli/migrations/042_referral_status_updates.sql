-- 042: Referral status tracking log ("מעקב הפנייה").
--
-- Until now referrals.status_note was a single free-text field that gets
-- silently overwritten on every edit — no way to see what was said last
-- week vs today, and no structured way to say "this referral is stuck
-- waiting on paperwork" that the UI could act on. Explicit request: be able
-- to save a dated, running log of updates ("ממתין לרכב חלופי", "השלמת
-- ניירת וטרם תואם", ...), and have the /referrals list visually flag a
-- referral that's waiting on paperwork and hasn't become a case yet.
--
-- referrals.status_note is left as-is (still useful as a quick one-line
-- summary field) — this adds a real history alongside it.

CREATE TABLE IF NOT EXISTS referral_status_updates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referral_id   UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  status_tag    TEXT CHECK (status_tag IN (
                  'AWAITING_REPLACEMENT_CAR', 'AWAITING_PAPERWORK',
                  'AWAITING_SCHEDULING', 'OTHER'
                )),
  note          TEXT,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_status_updates_referral_id ON referral_status_updates(referral_id);

-- Denormalized onto referrals so the list page can color a card yellow
-- without an N+1 "latest update per referral" query. Kept in sync by the
-- server action that inserts a new update (addReferralStatusUpdate), not by
-- a DB trigger — same "app owns the write" pattern as the rest of this file.
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS current_status_tag TEXT;

ALTER TABLE referral_status_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_status_updates_select ON referral_status_updates;
CREATE POLICY referral_status_updates_select ON referral_status_updates
  FOR SELECT TO authenticated
  USING (
    referral_id IN (
      SELECT id FROM referrals
      WHERE branch_id = public.get_my_branch_id() OR public.can_see_all_branches()
    )
    AND public.get_my_role() IN ('OFFICE', 'CEO')
  );

DROP POLICY IF EXISTS referral_status_updates_insert ON referral_status_updates;
CREATE POLICY referral_status_updates_insert ON referral_status_updates
  FOR INSERT TO authenticated
  WITH CHECK (
    referral_id IN (
      SELECT id FROM referrals
      WHERE branch_id = public.get_my_branch_id() OR public.can_see_all_branches()
    )
    AND public.get_my_role() IN ('OFFICE', 'CEO')
    AND created_by = auth.uid()
  );

INSERT INTO schema_migrations (filename) VALUES ('042_referral_status_updates.sql')
ON CONFLICT (filename) DO NOTHING;
