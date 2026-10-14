-- Closure finance card (Amit, 2026-10-14): due date of the third-party claims
-- cheque (צד ג'), and optionally of a deposit cheque (צ'ק פיקדון).
ALTER TABLE public.finance_closures
  ADD COLUMN IF NOT EXISTS claim_check_due_date date,
  ADD COLUMN IF NOT EXISTS deposit_check_due_date date;
