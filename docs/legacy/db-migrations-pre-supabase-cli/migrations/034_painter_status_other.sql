-- 034: "אחר" (Other) option for painter_status, with a free-text field for
-- whatever the fixed options (IN_WORK / WAITING_PARTS / PARTS_ARRIVED /
-- READY_FOR_RELEASE) don't cover. painter_status itself stays TEXT with no
-- CHECK constraint (see 013), so no migration was needed for the new value
-- 'OTHER' itself — only for the column that holds the custom label.

ALTER TABLE cases ADD COLUMN IF NOT EXISTS painter_status_other_text TEXT;
