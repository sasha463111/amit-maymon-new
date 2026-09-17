-- Revert storage functions back to SECURITY DEFINER
--
-- Root cause investigation: SECURITY INVOKER doesn't work reliably with
-- Supabase storage operations. Storage layer may not properly set auth.uid()
-- when using INVOKER context, causing the function to receive NULL.
--
-- Solution: Revert to SECURITY DEFINER (which works), but keep the
-- corrected branch_ids array logic instead of the deleted branch_id column.
--
-- This combines both fixes:
-- 1. SECURITY DEFINER ensures auth context is available (storage layer compatibility)
-- 2. branch_id = ANY(branch_ids) ensures multi-branch users work correctly

CREATE OR REPLACE FUNCTION public._storage_user_can_see_referral (
  referral_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.referrals r
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE r.id = referral_id
      AND p.role IN ('OFFICE', 'CEO')
      AND (p.role = 'CEO' OR r.branch_id = ANY(p.branch_ids) OR p.sees_all_branches = true)
  )
$function$;

CREATE OR REPLACE FUNCTION public._storage_user_can_see_case (
  case_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.cases c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = case_id
      AND (p.role = 'CEO' OR p.sees_all_branches = true OR c.branch_id = ANY(p.branch_ids))
  )
$function$;
