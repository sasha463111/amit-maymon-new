-- Add persistent storage for Ilana's closure checklist per case
ALTER TABLE cases ADD COLUMN IF NOT EXISTS closure_checklist_state JSONB DEFAULT '{}' NOT NULL;

-- Comment explaining format: {"0": true, "2": true} — keys are item indices, value is always true (absent = false)
COMMENT ON COLUMN cases.closure_checklist_state IS 'Stores checked state of closure checklist items. Keys are item indices (0-based strings), value is true when checked.';
