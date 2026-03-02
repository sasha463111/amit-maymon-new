-- Migration 009: Settings tables (role_permissions + workflow_step_templates)

-- Role permissions table
CREATE TABLE IF NOT EXISTS role_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role       TEXT NOT NULL,
  action     TEXT NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role, action)
);

-- Workflow step templates table (drives which steps are created for new cases)
CREATE TABLE IF NOT EXISTS workflow_step_templates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_key             TEXT UNIQUE NOT NULL,
  step_label           TEXT NOT NULL,
  order_index          INTEGER NOT NULL,
  is_enabled           BOOLEAN NOT NULL DEFAULT true,
  requires_link        BOOLEAN NOT NULL DEFAULT false,
  requires_file_or_link BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed workflow_step_templates with the new step configuration
INSERT INTO workflow_step_templates (step_key, step_label, order_index, is_enabled, requires_link, requires_file_or_link) VALUES
  ('OPEN_CASE',               'פתיחת תיק',                          0,  true,  false, false),
  ('FIXCAR_PHOTOS',           'צילום FixCar',                        1,  true,  true,  false),
  ('WHEELS_CHECK',            'טפסי גלגלים',                         2,  true,  false, true),
  ('PREP_ESTIMATE',           'אומדן',                               3,  true,  false, false),
  ('SEND_TO_APPRAISER',       'שליחה לשמאי',                         4,  true,  false, false),
  ('WAIT_APPRAISER_APPROVAL', 'המתנה לאישור שמאי',                   5,  true,  false, false),
  ('ENTER_WORK',              'כניסה לעבודה',                        6,  true,  false, false),
  ('ISSUE_CATALOG_NUMBERS',   'ניפוק מק"טים',                        7,  true,  false, false),
  ('PARTS_DISCOUNTS',         'הנחות חלקים',                         8,  true,  false, false),
  ('QUALITY_CONTROL',         'בקרת איכות',                          9,  true,  false, false),
  ('WASH',                    'שטיפה',                               10, true,  false, false),
  ('SEND_COMPLETION_PHOTOS',  'שליחת תמונות לשמאי גמר תיקון',       11, true,  false, false),
  ('READY_FOR_OFFICE',        'מוכן למשרד',                          12, true,  false, false)
ON CONFLICT (step_key) DO NOTHING;

-- Seed role_permissions with default permissions
INSERT INTO role_permissions (role, action, enabled) VALUES
  ('SERVICE_MANAGER', 'create_case',              true),
  ('SERVICE_MANAGER', 'complete_professional_step', true),
  ('SERVICE_MANAGER', 'complete_closure_step',    false),
  ('SERVICE_MANAGER', 'manage_settings',          false),
  ('SERVICE_MANAGER', 'decide_approvals',         false),
  ('SERVICE_MANAGER', 'manage_extras_status',     true),
  ('SERVICE_MANAGER', 'upload_documents',         true),
  ('SERVICE_MANAGER', 'delete_documents',         true),
  ('OFFICE',          'create_case',              true),
  ('OFFICE',          'complete_professional_step', false),
  ('OFFICE',          'complete_closure_step',    true),
  ('OFFICE',          'manage_settings',          false),
  ('OFFICE',          'decide_approvals',         false),
  ('OFFICE',          'manage_extras_status',     false),
  ('OFFICE',          'upload_documents',         true),
  ('OFFICE',          'delete_documents',         true),
  ('CEO',             'create_case',              true),
  ('CEO',             'complete_professional_step', true),
  ('CEO',             'complete_closure_step',    true),
  ('CEO',             'manage_settings',          true),
  ('CEO',             'decide_approvals',         true),
  ('CEO',             'manage_extras_status',     true),
  ('CEO',             'upload_documents',         true),
  ('CEO',             'delete_documents',         true),
  ('PAINTER',         'create_case',              false),
  ('PAINTER',         'complete_professional_step', false),
  ('PAINTER',         'complete_closure_step',    false),
  ('PAINTER',         'manage_settings',          false),
  ('PAINTER',         'decide_approvals',         false),
  ('PAINTER',         'manage_extras_status',     false),
  ('PAINTER',         'upload_documents',         false),
  ('PAINTER',         'delete_documents',         false),
  ('SERVICE_ADVISOR', 'create_case',              false),
  ('SERVICE_ADVISOR', 'complete_professional_step', false),
  ('SERVICE_ADVISOR', 'complete_closure_step',    false),
  ('SERVICE_ADVISOR', 'manage_settings',          false),
  ('SERVICE_ADVISOR', 'decide_approvals',         false),
  ('SERVICE_ADVISOR', 'manage_extras_status',     false),
  ('SERVICE_ADVISOR', 'upload_documents',         false),
  ('SERVICE_ADVISOR', 'delete_documents',         false)
ON CONFLICT (role, action) DO NOTHING;

-- RLS policies for settings tables (CEO only)
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_step_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CEO can manage role_permissions"
  ON role_permissions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'CEO'
    )
  );

CREATE POLICY "All authenticated can read workflow_step_templates"
  ON workflow_step_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "CEO can manage workflow_step_templates"
  ON workflow_step_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'CEO'
    )
  );
