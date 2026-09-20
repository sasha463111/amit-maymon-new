-- Actually close anonymous RPC access (the previous revoke was ineffective)
--
-- 20260920030000 revoked EXECUTE from `anon` — and anon could still call
-- branch_recipients and still received all 17 staff rows.
--
-- Reason: Postgres grants EXECUTE on new functions to PUBLIC by default, and
-- anon is a member of PUBLIC. Revoking the role-specific grant leaves the
-- inherited PUBLIC grant intact, so nothing changes. The revoke must target
-- PUBLIC itself.
--
-- Because authenticated also inherits from PUBLIC, the grant has to be handed
-- back explicitly afterwards, or every RLS policy that calls a helper
-- (get_my_role, get_my_branch_ids, can_see_all_branches, has_permission, the
-- _storage_* family) would fail for signed-in users — which would take down the
-- entire application.
--
-- Order matters: revoke from PUBLIC first, then grant to the roles that need it.

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Signed-in users: required for RLS evaluation and for the four RPCs the app
-- calls directly (branch_recipients, has_permission, save_push_subscription,
-- remove_push_subscription).
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Server-side/service usage (cron route, admin client).
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Keep new functions following the same pattern automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
