-- Restore EXECUTE for Supabase's internal service roles
--
-- 20260920040000 revoked EXECUTE on public functions from PUBLIC to stop
-- anonymous staff enumeration, then re-granted to authenticated and
-- service_role. Correct as far as it went — but two Supabase-managed roles were
-- also relying on the PUBLIC grant and silently lost access:
--
--   supabase_auth_admin     runs the auth schema, and fires the
--                           handle_new_user trigger when an account is created
--   supabase_storage_admin  runs the storage schema, whose bucket policies call
--                           _storage_user_can_see_case / _storage_user_can_see_referral
--
-- Observed behaviour after the revoke: uploads and user creation still worked,
-- because both paths evaluate as the calling user (authenticated), who kept the
-- grant. So this is precautionary rather than a fix for a live breakage — but
-- relying on "the internal role happens not to need it on this code path" is
-- not a property to bet a launch on, and Supabase may invoke these differently
-- on paths not exercised here (admin APIs, password resets, storage cleanup).
--
-- Granting to these two does NOT reopen the leak: `anon` remains without
-- EXECUTE, which is the role a browser presents when nobody is signed in.
-- Verified again after applying.

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO supabase_storage_admin;

-- Keep future functions consistent, same as already done for authenticated and
-- service_role, so this cannot silently regress when a function is added.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO supabase_auth_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO supabase_storage_admin;
