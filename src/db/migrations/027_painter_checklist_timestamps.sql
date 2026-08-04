-- 027: Track when each painter checklist item was marked done, so the UI
-- can show "checked on <date>" next to the checkmark instead of just the
-- current boolean state.

ALTER TABLE cases ADD COLUMN IF NOT EXISTS painter_entered_work_at TIMESTAMPTZ;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS parts_arrived_at TIMESTAMPTZ;
