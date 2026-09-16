-- Fix storage access functions to use branch_ids (array) not branch_id (singular)
--
-- Root cause: When profiles.schema changed from branch_id to branch_ids,
-- we updated Server Actions (referrals.ts, documents.ts) but NOT the database-level
-- RLS helper functions that those Server Actions depend on.
--
-- This caused _storage_user_can_see_referral/case to fail when checking branch access,
-- blocking ALL file uploads with "Storage: new row violates row-level security policy".
--
-- Fix: Change `p.branch_id = x.branch_id` to `x.branch_id = ANY(p.branch_ids)`
-- across all storage access functions.

-- Fix _storage_user_can_see_referral: use branch_ids array instead of branch_id
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

-- Fix _storage_user_can_see_case: use branch_ids array instead of branch_id
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
