-- Close anonymous staff enumeration before going live
--
-- Supabase exposes every public-schema function as a REST RPC endpoint, and the
-- `anon` role (whose key ships in the browser bundle) could execute all of them.
--
-- Confirmed exploitable: an unauthenticated caller hitting
--   POST /rest/v1/rpc/branch_recipients  { "p_branch": "<branch-uuid>" }
-- received 17 rows of staff — user ids, roles and is_bodywork_advisor — because
-- branch_recipients is SECURITY DEFINER and therefore bypasses RLS by design.
-- Branch ids are not secret; they appear in the client for any signed-in user
-- and only 2 exist, so guessing is trivial.
--
-- Fix: revoke EXECUTE from anon on every function in public.
--
-- `authenticated` is deliberately left untouched. RLS policies call several of
-- these helpers (get_my_role, get_my_branch_ids, can_see_all_branches,
-- has_permission, the _storage_* family) while evaluating as the calling user,
-- so revoking there risks breaking every policy at once — a far worse outcome
-- than a signed-in employee being able to call a helper directly. Those
-- functions only ever return data about the caller's own session anyway.
--
-- Note: future functions are NOT covered automatically. Either re-run this
-- revoke after adding one, or set a default:
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Stop new functions from being exposed to anon by default going forward.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- Two helpers were flagged for a mutable search_path, which lets a caller who
-- can set search_path influence which objects they resolve to. Pin both.
ALTER FUNCTION public.get_my_branch_ids() SET search_path TO 'public';
ALTER FUNCTION public.get_my_branch_id() SET search_path TO 'public';
