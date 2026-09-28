-- Migration 028 — Cross-branch access flag.
--
-- Some staff (reception/office + service advisors) must work across BOTH
-- branches, which until now only the CEO could. This adds an opt-in per-user
-- flag `sees_all_branches` and folds it into every branch-scoped RLS policy via
-- a recursion-safe SECURITY DEFINER helper, WITHOUT changing any existing branch
-- predicate (it only ORs the helper in).
--
-- Set the flag per user:  UPDATE profiles SET sees_all_branches = true WHERE id = ...;
-- can_see_all_branches() also returns true for CEO (redundant with existing CEO
-- bypasses, harmless).

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sees_all_branches boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.can_see_all_branches()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'CEO' OR sees_all_branches = true)); $$;
REVOKE ALL ON FUNCTION public.can_see_all_branches() FROM public;
GRANT EXECUTE ON FUNCTION public.can_see_all_branches() TO authenticated;

-- Programmatically OR can_see_all_branches() into every branch-scoped policy's
-- USING / WITH CHECK. Preserves the exact predicate; idempotent.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, pol.polname AS name,
           pg_get_expr(pol.polqual, pol.polrelid) AS u,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS w
    FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
    WHERE c.relnamespace = 'public'::regnamespace
      AND (pg_get_expr(pol.polqual, pol.polrelid) ILIKE '%branch%'
        OR pg_get_expr(pol.polwithcheck, pol.polrelid) ILIKE '%branch%')
  LOOP
    IF r.u IS NOT NULL AND position('can_see_all_branches' in r.u) = 0 THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING ((%s) OR public.can_see_all_branches())', r.name, r.tbl, r.u);
    END IF;
    IF r.w IS NOT NULL AND position('can_see_all_branches' in r.w) = 0 THEN
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK ((%s) OR public.can_see_all_branches())', r.name, r.tbl, r.w);
    END IF;
  END LOOP;
END $$;
