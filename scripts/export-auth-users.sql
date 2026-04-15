-- =============================================================================
-- Export auth.users from OLD Supabase project as INSERT statements
--
-- Usage:
--   1. OLD project → SQL Editor → paste this query → Run
--   2. Click the first result cell to view the full column, or export CSV
--   3. In NEW project → SQL Editor → paste the generated INSERT statements → Run
--
-- Preserves: id, email, encrypted_password, email_confirmed_at, metadata.
-- Passwords remain valid because encrypted_password (bcrypt hash) is copied.
-- =============================================================================

SELECT format(
  $$INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
    recovery_token, recovery_sent_at, email_change_token_new, email_change,
    email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at, phone, phone_confirmed_at,
    phone_change, phone_change_token, phone_change_sent_at, confirmed_at,
    email_change_token_current, email_change_confirm_status, banned_until,
    reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at
  ) VALUES (
    %L, %L, %L, %L, %L, %L,
    %L, %L, %L, %L,
    %L, %L, %L, %L,
    %L, %L, %L::jsonb, %L::jsonb,
    %L, %L, %L, %L, %L,
    %L, %L, %L, %L,
    %L, %L, %L,
    %L, %L, %L, %L
  ) ON CONFLICT (id) DO NOTHING;$$,
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
  recovery_token, recovery_sent_at, email_change_token_new, email_change,
  email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at, phone, phone_confirmed_at,
  phone_change, phone_change_token, phone_change_sent_at, confirmed_at,
  email_change_token_current, email_change_confirm_status, banned_until,
  reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at
) AS sql
FROM auth.users
WHERE deleted_at IS NULL
ORDER BY created_at;

-- =============================================================================
-- Also export auth.identities (needed for password login to keep working)
-- =============================================================================
SELECT format(
  $$INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at,
    created_at, updated_at, email, id
  ) VALUES (
    %L, %L, %L::jsonb, %L, %L,
    %L, %L, %L, %L
  ) ON CONFLICT (id) DO NOTHING;$$,
  provider_id, user_id, identity_data, provider, last_sign_in_at,
  created_at, updated_at, email, id
) AS sql
FROM auth.identities
ORDER BY created_at;
