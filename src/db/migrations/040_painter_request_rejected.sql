-- 040: Add REJECTED status + a free-text response note to painter_requests,
-- so a manager/CEO can decide "בוצע" or "נדחה" with a manually-typed comment
-- when responding to a painter's request — not just flip status blind.
--
-- Drops the existing status CHECK constraint by looking it up dynamically
-- (not by a hardcoded name) — after today's earlier lesson that trusting an
-- assumed object name against this project's live schema is not safe,
-- verify/derive it instead of guessing.

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'painter_requests'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE painter_requests DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE painter_requests
  ADD CONSTRAINT painter_requests_status_check
  CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE', 'REJECTED'));

ALTER TABLE painter_requests ADD COLUMN IF NOT EXISTS response_note TEXT;

INSERT INTO schema_migrations (filename) VALUES ('040_painter_request_rejected.sql')
ON CONFLICT (filename) DO NOTHING;
