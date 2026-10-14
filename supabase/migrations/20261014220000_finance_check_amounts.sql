-- Closure finance card (Amit, 2026-10-14): amounts of the claims cheque and
-- of the (optional) deposit cheque, next to their due dates — for collection.
ALTER TABLE public.finance_closures
  ADD COLUMN IF NOT EXISTS claim_check_amount numeric(12,2) CHECK (claim_check_amount >= 0),
  ADD COLUMN IF NOT EXISTS deposit_check_amount numeric(12,2) CHECK (deposit_check_amount >= 0);
