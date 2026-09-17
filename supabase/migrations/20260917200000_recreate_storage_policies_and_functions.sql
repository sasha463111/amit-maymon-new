-- Recreate storage bucket policies and functions
--
-- Root cause: The 20260915115332 remote schema migration DROPPED all storage.objects
-- policies but never recreated them. This caused ALL file uploads to be rejected
-- with "Storage: new row violates row-level security policy".
--
-- Fix: Recreate storage bucket RLS policies + helper functions:
-- 1. _storage_referral_id() - extract referral ID from path
-- 2. _storage_case_id() - extract case ID from path
-- 3. _storage_user_can_see_referral() - check if user can access referral
-- 4. _storage_user_can_see_case() - check if user can access case
-- 5. Storage bucket policies on storage.objects

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Drop existing functions to avoid parameter name conflicts
DROP FUNCTION IF EXISTS public._storage_referral_id CASCADE;
DROP FUNCTION IF EXISTS public._storage_case_id CASCADE;
DROP FUNCTION IF EXISTS public._storage_user_can_see_referral CASCADE;
DROP FUNCTION IF EXISTS public._storage_user_can_see_case CASCADE;

-- Recreate _storage_referral_id
-- Path format: {referral_id}/{filename}
CREATE FUNCTION public._storage_referral_id (path text)
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT (string_to_array(path, '/'))[1]::uuid
$function$;

-- Recreate _storage_case_id
-- Path format: {case_id}/{filename}
CREATE FUNCTION public._storage_case_id (path text)
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT (string_to_array(path, '/'))[1]::uuid
$function$;

-- Recreate _storage_user_can_see_referral with correct branch_ids logic
CREATE FUNCTION public._storage_user_can_see_referral (
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

-- Recreate _storage_user_can_see_case with correct branch_ids logic
CREATE FUNCTION public._storage_user_can_see_case (
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

-- =============================================================================
-- STORAGE BUCKET POLICIES
-- =============================================================================

-- Recreate referral-documents bucket policies
CREATE POLICY "referral-documents delete" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'referral-documents'::text) AND public._storage_user_can_see_referral(public._storage_referral_id(name))));

CREATE POLICY "referral-documents read" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'referral-documents'::text) AND public._storage_user_can_see_referral(public._storage_referral_id(name))));

CREATE POLICY "referral-documents upload" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'referral-documents'::text) AND public._storage_user_can_see_referral(public._storage_referral_id(name))));

-- Recreate case-documents bucket policies (if they existed)
CREATE POLICY "case-documents delete" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'case-documents'::text) AND public._storage_user_can_see_case(public._storage_case_id(name))));

CREATE POLICY "case-documents read" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'case-documents'::text) AND public._storage_user_can_see_case(public._storage_case_id(name))));

CREATE POLICY "case-documents upload" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'case-documents'::text) AND public._storage_user_can_see_case(public._storage_case_id(name))));
