-- 037: Add "צה"ל" (military) and "אחר" (other, free text) to sub_claim_type.
-- Unlike painter_status (034), sub_claim_type IS a real Postgres enum (see
-- 006), so the new values need an explicit ALTER TYPE each — can't just add
-- a text column like 034 did. ADD VALUE statements must each be their own
-- top-level statement (not combined with other DDL in one transaction) per
-- Postgres's rule that a freshly-added enum value can't be used within the
-- same transaction that added it — safe here since nothing in this file
-- inserts a row using MILITARY/OTHER, but keep that rule in mind if this
-- file is ever edited.

ALTER TYPE sub_claim_type ADD VALUE IF NOT EXISTS 'MILITARY';
ALTER TYPE sub_claim_type ADD VALUE IF NOT EXISTS 'OTHER';

-- Free-text companion for OTHER, same pattern as painter_status_other_text (034).
ALTER TABLE cases ADD COLUMN IF NOT EXISTS sub_claim_type_other_text TEXT;

INSERT INTO schema_migrations (filename) VALUES ('037_sub_claim_type_military_other.sql')
ON CONFLICT (filename) DO NOTHING;
