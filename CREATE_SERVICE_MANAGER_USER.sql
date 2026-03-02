-- ============================================================
-- משתמש טסט: SERVICE_MANAGER
-- הרץ ב-Supabase: SQL Editor → New query → הדבק → Run
--
-- אחרי ההרצה התחבר עם:
--   אימייל: manager@test.com
--   סיסמה: TestManager123!
-- ============================================================

DO $$
DECLARE
  new_user_id UUID := gen_random_uuid();
  first_branch_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'manager@test.com') THEN
    RAISE NOTICE 'משתמש manager@test.com כבר קיים — דילוג.';
    RETURN;
  END IF;

  -- נבחר סניף ראשון (אשקלון או נתיבות) כדי להשייך את מנהל השירות
  SELECT id INTO first_branch_id FROM branches ORDER BY name LIMIT 1;
  IF first_branch_id IS NULL THEN
    RAISE EXCEPTION 'אין סניפים בטבלת branches. הרץ קודם את seed של הסניפים.';
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
    'manager@test.com',
    crypt('TestManager123!', gen_salt('bf')),
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

  INSERT INTO profiles (id, full_name, role, branch_id, is_active)
  VALUES (new_user_id, 'מנהל שירות טסט', 'SERVICE_MANAGER', first_branch_id, true)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    branch_id = EXCLUDED.branch_id,
    is_active = EXCLUDED.is_active;

  RAISE NOTICE 'משתמש SERVICE_MANAGER נוצר: email=manager@test.com  password=TestManager123!  branch_id=%', first_branch_id;
END $$;
