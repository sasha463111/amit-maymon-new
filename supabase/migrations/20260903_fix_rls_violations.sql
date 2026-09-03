-- Migration: Fix RLS Violations Found in QA Testing
-- Date: 2026-09-03
-- Issues Fixed:
-- 1. OFFICE staff unable to access referrals table
-- 2. SERVICE_MANAGER can see cross-branch data
-- 3. Ensure PAINTER role is properly restricted

-- First, let's review and fix the referrals RLS policies
-- The referrals table should be accessible by OFFICE and CEO roles with proper branch filtering

BEGIN;

-- Drop existing RLS policies on referrals table to start fresh
DROP POLICY IF EXISTS referrals_select ON public.referrals;
DROP POLICY IF EXISTS referrals_insert ON public.referrals;
DROP POLICY IF EXISTS referrals_update ON public.referrals;
DROP POLICY IF EXISTS referrals_delete ON public.referrals;

-- Recreate referrals SELECT policy - OFFICE and CEO can see
CREATE POLICY referrals_select ON public.referrals
  FOR SELECT
  USING (
    (public.get_my_role() = 'CEO')
    OR
    (public.get_my_role() = 'OFFICE' AND branch_id = ANY(public.get_my_branch_ids()))
  );

-- Recreate referrals INSERT policy - OFFICE and CEO can insert
CREATE POLICY referrals_insert ON public.referrals
  FOR INSERT
  WITH CHECK (
    (public.get_my_role() = 'CEO')
    OR
    (public.get_my_role() = 'OFFICE' AND branch_id = ANY(public.get_my_branch_ids()))
  );

-- Recreate referrals UPDATE policy - OFFICE and CEO can update
CREATE POLICY referrals_update ON public.referrals
  FOR UPDATE
  USING (
    (public.get_my_role() = 'CEO')
    OR
    (public.get_my_role() = 'OFFICE' AND branch_id = ANY(public.get_my_branch_ids()))
  )
  WITH CHECK (
    (public.get_my_role() = 'CEO')
    OR
    (public.get_my_role() = 'OFFICE' AND branch_id = ANY(public.get_my_branch_ids()))
  );

-- Recreate referrals DELETE policy - OFFICE and CEO can delete
CREATE POLICY referrals_delete ON public.referrals
  FOR DELETE
  USING (
    (public.get_my_role() = 'CEO')
    OR
    (public.get_my_role() = 'OFFICE' AND branch_id = ANY(public.get_my_branch_ids()))
  );

-- Fix cases table RLS for SERVICE_MANAGER - ensure branch isolation
DROP POLICY IF EXISTS cases_select ON public.cases;
DROP POLICY IF EXISTS cases_insert ON public.cases;
DROP POLICY IF EXISTS cases_update ON public.cases;

-- Cases SELECT policy - CEO sees all, others see only their branches
CREATE POLICY cases_select ON public.cases
  FOR SELECT
  USING (
    (public.get_my_role() = 'CEO')
    OR
    (branch_id = ANY(public.get_my_branch_ids()))
  );

-- Cases INSERT policy
CREATE POLICY cases_insert ON public.cases
  FOR INSERT
  WITH CHECK (
    (public.get_my_role() = 'CEO')
    OR
    (public.get_my_role() = 'SERVICE_MANAGER' AND branch_id = ANY(public.get_my_branch_ids()))
    OR
    (public.get_my_role() = 'OFFICE' AND branch_id = ANY(public.get_my_branch_ids()))
  );

-- Cases UPDATE policy
CREATE POLICY cases_update ON public.cases
  FOR UPDATE
  USING (
    (public.get_my_role() = 'CEO')
    OR
    (branch_id = ANY(public.get_my_branch_ids()))
  )
  WITH CHECK (
    (public.get_my_role() = 'CEO')
    OR
    (branch_id = ANY(public.get_my_branch_ids()))
  );

-- Verify PAINTER role has NO database access to sensitive tables
-- PAINTER should only access painter_requests and their own data
DROP POLICY IF EXISTS painter_requests_select ON public.painter_requests;
CREATE POLICY painter_requests_select ON public.painter_requests
  FOR SELECT
  USING (
    (public.get_my_role() = 'PAINTER' AND created_by = auth.uid())
    OR
    (public.get_my_role() = 'SERVICE_MANAGER' AND
     EXISTS (
       SELECT 1 FROM public.cases c
       WHERE c.id = painter_requests.case_id
       AND c.branch_id = ANY(public.get_my_branch_ids())
     ))
    OR
    (public.get_my_role() = 'CEO')
  );

COMMIT;

-- Log this migration
INSERT INTO schema_migrations (filename) VALUES ('20260903_fix_rls_violations.sql') ON CONFLICT (filename) DO NOTHING;
