-- New jobs for the parts-returns module (Amit, 2026-10-12): warehouse staff
-- ("מחסנאי") and the warehouse manager ("מנהל מחסן", Roei).
-- Enum values must be committed before anything uses them, so this is its
-- own migration. Idempotent.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'WAREHOUSE';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'WAREHOUSE_MANAGER';
