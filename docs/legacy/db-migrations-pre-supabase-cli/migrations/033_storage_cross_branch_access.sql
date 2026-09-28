-- Migration 033: let cross-branch staff access case-document storage.
--
-- ROOT CAUSE of "ערן can't upload files/links to steps": the Storage RLS for the
-- case-documents bucket (upload/read/delete) is gated by
-- _storage_user_can_see_case(), which only allowed role=CEO OR branch match. It
-- omitted sees_all_branches, so a cross-branch user (branch_id NULL,
-- sees_all_branches=true) was blocked at the Storage layer even though the app
-- code and the cases/cars table RLS already permit them. Add the sees_all bypass.
-- Branch isolation is preserved: a branch-specific user (sees_all=false) still
-- only matches their own branch.

CREATE OR REPLACE FUNCTION public._storage_user_can_see_case(case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.cases c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = case_id
      AND (p.role = 'CEO' OR p.sees_all_branches = true OR p.branch_id = c.branch_id)
  )
$function$;
