-- Migration 010: Fix RLS INSERT policies to allow CEO
-- CEO has branch_id = NULL so the branch_id IN (...) check always fails for CEO

-- Fix cars INSERT: allow CEO to insert into any branch
DROP POLICY IF EXISTS cars_insert ON cars;
CREATE POLICY cars_insert ON cars FOR INSERT TO authenticated
  WITH CHECK (
    branch_id IN (SELECT branch_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
  );

-- Fix cars UPDATE: allow CEO to update any car
DROP POLICY IF EXISTS cars_update ON cars;
CREATE POLICY cars_update ON cars FOR UPDATE TO authenticated
  USING (
    branch_id IN (SELECT branch_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
  );

-- Fix cases INSERT: allow CEO to insert into any branch
DROP POLICY IF EXISTS cases_insert ON cases;
CREATE POLICY cases_insert ON cases FOR INSERT TO authenticated
  WITH CHECK (
    branch_id IN (SELECT branch_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
  );