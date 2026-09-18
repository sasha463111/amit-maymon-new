-- Fix all CEOs to have sees_all_branches = true
--
-- Root cause: CEOs were created with sees_all_branches = false
-- but CEOs should ALWAYS have sees_all_branches = true to see all branches
--
-- Fix: Update all CEO profiles to sees_all_branches = true

UPDATE public.profiles
SET sees_all_branches = true
WHERE role = 'CEO'::user_role
  AND sees_all_branches = false;
