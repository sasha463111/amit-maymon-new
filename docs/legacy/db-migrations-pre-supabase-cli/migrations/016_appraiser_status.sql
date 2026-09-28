-- 016: Appraiser status column on cases
-- Values: APPROVED | NOT_APPROVED | WAITING_SETTLEMENT

ALTER TABLE cases ADD COLUMN IF NOT EXISTS appraiser_status TEXT;
