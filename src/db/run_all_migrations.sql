-- =============================================================================
-- TEHILA BODYSHOP CRM — FULL MIGRATIONS SCRIPT (006–009)
-- Run this entire file in Supabase Dashboard → SQL Editor
--
-- IMPORTANT: Migration 007 (ALTER TYPE ADD VALUE) must run OUTSIDE a transaction.
-- Supabase SQL Editor runs each statement without an auto-wrapping transaction,
-- so pasting the whole file at once is safe.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 006: New case fields + sub_claim_type enum + vehicle_type
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sub_claim_type') THEN
    CREATE TYPE sub_claim_type AS ENUM (
      'POLICY',
      'THIRD_PARTY',
      'THIRD_PARTY_SETTLEMENT',
      'PRIVATE_REPAIR',
      'SHLOMO_POLICY',
      'SHLOMO_THIRD_PARTY'
    );
  END IF;
END $$;

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS customer_name     TEXT,
  ADD COLUMN IF NOT EXISTS phone             TEXT,
  ADD COLUMN IF NOT EXISTS insurance_company TEXT,
  ADD COLUMN IF NOT EXISTS appraiser_name    TEXT,
  ADD COLUMN IF NOT EXISTS event_date        DATE,
  ADD COLUMN IF NOT EXISTS wheels_check_link TEXT,
  ADD COLUMN IF NOT EXISTS sub_claim_type    sub_claim_type;

ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT;


-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 007: Add AIRMAIL_PENDING to parts_status enum
-- Note: ALTER TYPE ADD VALUE cannot run inside a transaction.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE parts_status ADD VALUE IF NOT EXISTS 'AIRMAIL_PENDING';


-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 008: Update workflow steps for existing cases
-- Removes SUMMARIZE_ESTIMATE, adds 3 new steps, re-orders all steps
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Remove SUMMARIZE_ESTIMATE steps
DELETE FROM case_workflow_steps WHERE step_key = 'SUMMARIZE_ESTIMATE';

-- Step 2: Shift affected steps temporarily to avoid index conflicts
UPDATE case_workflow_steps
SET order_index = order_index + 100
WHERE step_key IN ('SEND_TO_APPRAISER', 'WAIT_APPRAISER_APPROVAL', 'ENTER_WORK', 'QUALITY_CONTROL', 'WASH', 'READY_FOR_OFFICE');

-- Step 3: Set final order_index for all professional workflow steps
UPDATE case_workflow_steps SET order_index = 0  WHERE step_key = 'OPEN_CASE';
UPDATE case_workflow_steps SET order_index = 1  WHERE step_key = 'FIXCAR_PHOTOS';
UPDATE case_workflow_steps SET order_index = 2  WHERE step_key = 'WHEELS_CHECK';
UPDATE case_workflow_steps SET order_index = 3  WHERE step_key = 'PREP_ESTIMATE';
UPDATE case_workflow_steps SET order_index = 4  WHERE step_key = 'SEND_TO_APPRAISER';
UPDATE case_workflow_steps SET order_index = 5  WHERE step_key = 'WAIT_APPRAISER_APPROVAL';
UPDATE case_workflow_steps SET order_index = 6  WHERE step_key = 'ENTER_WORK';
UPDATE case_workflow_steps SET order_index = 9  WHERE step_key = 'QUALITY_CONTROL';
UPDATE case_workflow_steps SET order_index = 10 WHERE step_key = 'WASH';
UPDATE case_workflow_steps SET order_index = 12 WHERE step_key = 'READY_FOR_OFFICE';

-- Step 4: Add ISSUE_CATALOG_NUMBERS (order 7) to active professional runs
INSERT INTO case_workflow_steps (run_id, step_key, state, order_index)
SELECT r.id, 'ISSUE_CATALOG_NUMBERS', 'PENDING', 7
FROM case_workflow_runs r
WHERE r.status = 'ACTIVE' AND r.workflow_type = 'PROFESSIONAL'
  AND NOT EXISTS (
    SELECT 1 FROM case_workflow_steps cs
    WHERE cs.run_id = r.id AND cs.step_key = 'ISSUE_CATALOG_NUMBERS'
  );

-- Step 5: Add PARTS_DISCOUNTS (order 8) to active professional runs
INSERT INTO case_workflow_steps (run_id, step_key, state, order_index)
SELECT r.id, 'PARTS_DISCOUNTS', 'PENDING', 8
FROM case_workflow_runs r
WHERE r.status = 'ACTIVE' AND r.workflow_type = 'PROFESSIONAL'
  AND NOT EXISTS (
    SELECT 1 FROM case_workflow_steps cs
    WHERE cs.run_id = r.id AND cs.step_key = 'PARTS_DISCOUNTS'
  );

-- Step 6: Add SEND_COMPLETION_PHOTOS (order 11) to active professional runs
INSERT INTO case_workflow_steps (run_id, step_key, state, order_index)
SELECT r.id, 'SEND_COMPLETION_PHOTOS', 'PENDING', 11
FROM case_workflow_runs r
WHERE r.status = 'ACTIVE' AND r.workflow_type = 'PROFESSIONAL'
  AND NOT EXISTS (
    SELECT 1 FROM case_workflow_steps cs
    WHERE cs.run_id = r.id AND cs.step_key = 'SEND_COMPLETION_PHOTOS'
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 009: Settings tables (role_permissions + workflow_step_templates)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS role_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role       TEXT NOT NULL,
  action     TEXT NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role, action)
);

CREATE TABLE IF NOT EXISTS workflow_step_templates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_key              TEXT UNIQUE NOT NULL,
  step_label            TEXT NOT NULL,
  order_index           INTEGER NOT NULL,
  is_enabled            BOOLEAN NOT NULL DEFAULT true,
  requires_link         BOOLEAN NOT NULL DEFAULT false,
  requires_file_or_link BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed workflow_step_templates
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

-- Seed role_permissions with default values
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

-- RLS policies for settings tables
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_step_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CEO can manage role_permissions" ON role_permissions;
CREATE POLICY "CEO can manage role_permissions"
  ON role_permissions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'CEO'
    )
  );

DROP POLICY IF EXISTS "All authenticated can read workflow_step_templates" ON workflow_step_templates;
CREATE POLICY "All authenticated can read workflow_step_templates"
  ON workflow_step_templates FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "CEO can manage workflow_step_templates" ON workflow_step_templates;
CREATE POLICY "CEO can manage workflow_step_templates"
  ON workflow_step_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'CEO'
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 010: Fix RLS INSERT policies to allow CEO
-- CEO has branch_id = NULL so the branch_id IN (...) check always fails for CEO
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS cars_insert ON cars;
CREATE POLICY cars_insert ON cars FOR INSERT TO authenticated
  WITH CHECK (
    branch_id IN (SELECT branch_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
  );

DROP POLICY IF EXISTS cars_update ON cars;
CREATE POLICY cars_update ON cars FOR UPDATE TO authenticated
  USING (
    branch_id IN (SELECT branch_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
  );

DROP POLICY IF EXISTS cases_insert ON cases;
CREATE POLICY cases_insert ON cases FOR INSERT TO authenticated
  WITH CHECK (
    branch_id IN (SELECT branch_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
  );

-- case_workflow_runs: INSERT when case was created by current user (fixes create-case RLS error)
DROP POLICY IF EXISTS case_workflow_runs_insert_creator ON case_workflow_runs;
CREATE POLICY case_workflow_runs_insert_creator ON case_workflow_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    case_id IN (SELECT id FROM cases WHERE created_by = auth.uid())
  );

-- case_workflow_runs: UPDATE for CEO
DROP POLICY IF EXISTS case_workflow_runs_update_ceo ON case_workflow_runs;
CREATE POLICY case_workflow_runs_update_ceo ON case_workflow_runs
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO'));

-- case_workflow_steps: UPDATE for CEO (so CEO can complete steps)
DROP POLICY IF EXISTS case_workflow_steps_update_ceo ON case_workflow_steps;
CREATE POLICY case_workflow_steps_update_ceo ON case_workflow_steps
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO'));


-- ─────────────────────────────────────────────────────────────────────────────
-- CEO TEST USER
-- Creates a CEO test user: email = ceo@test.com, password = TestCEO123!
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  new_user_id UUID := gen_random_uuid();
BEGIN
  -- Check if user already exists
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'ceo@test.com') THEN
    RAISE NOTICE 'CEO test user already exists — skipping creation.';
    RETURN;
  END IF;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    'ceo@test.com',
    crypt('TestCEO123!', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{}'::jsonb,
    false,
    '',
    '',
    '',
    ''
  );

  INSERT INTO profiles (id, full_name, role, is_active)
  VALUES (new_user_id, 'מנכ"ל טסט', 'CEO', true)
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'CEO test user created: email=ceo@test.com  password=TestCEO123!  id=%', new_user_id;
END $$;
