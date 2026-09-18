-- Make the Settings permission matrix actually govern the system
--
-- Until now role_permissions was display-only: the Settings screen read it and
-- let the CEO flip switches, but no server action and no RLS policy ever
-- consulted it. Flipping a switch saved a row and changed nothing.
--
-- This migration introduces has_permission(action) and makes the table the
-- single source of truth for the eight actions it defines.
--
-- Design:
--  * CEO is never gated by the table. The Settings UI already refuses to edit
--    CEO rows ("לא ניתן לשנות הרשאות מנכ\"ל"), so the CEO cannot lock themselves
--    out of the system - including out of Settings itself.
--  * Unknown role/action pairs deny. The matrix is complete (5 roles x 8
--    actions = 40 rows, all present), so this only affects future additions,
--    which should be granted deliberately rather than inherited open.
--  * Branch isolation stays hard-coded everywhere. The table decides WHAT a
--    role may do; it can never let anyone act outside their own branches.

CREATE OR REPLACE FUNCTION public.has_permission (p_action text)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT CASE
    WHEN public.get_my_role() = 'CEO'::public.user_role THEN true
    ELSE COALESCE(
      (SELECT rp.enabled
         FROM public.role_permissions rp
        WHERE rp.role = public.get_my_role()::text
          AND rp.action = p_action
        LIMIT 1),
      false
    )
  END
$function$;

-- ---------------------------------------------------------------------------
-- Align the matrix with what the system actually enforced until today.
--
-- Two rows claimed SERVICE_ADVISOR could do things the code has always refused:
--   create_case          - workflow.ts allows SERVICE_MANAGER / OFFICE / CEO
--   manage_extras_status - extras.ts allows SERVICE_MANAGER / CEO
-- Setting them false keeps behaviour identical to today now that the table is
-- authoritative. The CEO can turn either on deliberately from Settings.
--
-- The other six actions already matched the code exactly and are left untouched.
-- ---------------------------------------------------------------------------

UPDATE public.role_permissions
   SET enabled = false
 WHERE role = 'SERVICE_ADVISOR'
   AND action IN ('create_case', 'manage_extras_status');

-- ---------------------------------------------------------------------------
-- RLS: let the matrix govern case creation, while branch isolation stays fixed.
--
-- Before: the allowed roles were hard-coded into the policy, so the Settings
-- screen could never affect it. Now the role list comes from the table and the
-- policy only enforces that you cannot create a case outside your branches.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "cases_insert" ON "public"."cases";

CREATE POLICY "cases_insert" ON "public"."cases"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    public.has_permission('create_case')
    AND (
      public.get_my_role() = 'CEO'::public.user_role
      OR branch_id = ANY (public.get_my_branch_ids())
    )
  );
