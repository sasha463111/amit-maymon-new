-- Audit log table: tracks profile changes (user lifecycle)
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'create', 'update', 'delete'
  table_name TEXT NOT NULL,
  old_values jsonb,
  new_values jsonb,
  changed_by uuid REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Activity log table: tracks page visits and user actions
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'page_visit', 'create_user', 'edit_user', etc.
  page_url TEXT,
  metadata jsonb, -- additional context
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policies: only CEO can view audit logs
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CEO only - view audit log" ON audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'CEO'
    )
  );

CREATE POLICY "CEO only - view activity log" ON activity_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'CEO'
    )
  );

-- Insert into schema_migrations to track this migration
INSERT INTO schema_migrations (filename) VALUES ('20260902_audit_and_activity_logs.sql') ON CONFLICT (filename) DO NOTHING;
