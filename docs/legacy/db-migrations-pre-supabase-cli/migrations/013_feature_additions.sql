-- 013: Feature additions based on client feedback
-- Adds: notes, painter_status, sub-fields for ENTER_WORK, QC assignee,
--       estimate_link, case_id on notifications, system_messages table

-- ─── cases table additions ─────────────────────────────────────────────────
ALTER TABLE cases ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS painter_status TEXT DEFAULT 'IN_WORK';
ALTER TABLE cases ADD COLUMN IF NOT EXISTS parts_ordered BOOLEAN;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS parts_arrived BOOLEAN;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS qc_assignee TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS estimate_link TEXT;

-- ─── notifications: add case_id for deep-linking ──────────────────────────
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES cases(id) ON DELETE SET NULL;

-- ─── system_messages (CEO announcements shown to all users) ───────────────
CREATE TABLE IF NOT EXISTS system_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message    TEXT NOT NULL,
  is_active  BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE system_messages ENABLE ROW LEVEL SECURITY;

-- Everyone can read active messages
DROP POLICY IF EXISTS "read_system_messages" ON system_messages;
CREATE POLICY "read_system_messages" ON system_messages
  FOR SELECT USING (is_active = true);

-- Only CEO can insert/update/delete
DROP POLICY IF EXISTS "ceo_manage_system_messages" ON system_messages;
CREATE POLICY "ceo_manage_system_messages" ON system_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO'
    )
  );
