-- Expected payment date (Amit, 2026-10-14).
-- Policy / הסדר ג': end of the month of the insurer's payment approval + the
-- insurer's terms ("שוטף + N"), kept per insurer here (CEO edits; server-only).
-- צד ג': the claims cheque due date. Collectors enter the approval date.
CREATE TABLE IF NOT EXISTS public.insurer_payment_terms (
  insurer     text PRIMARY KEY,
  net_days    integer NOT NULL CHECK (net_days >= 0 AND net_days <= 365),
  notes       text,
  updated_by  uuid REFERENCES public.profiles(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.insurer_payment_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.insurer_payment_terms FROM anon, authenticated;
ALTER TABLE public.finance_collections ADD COLUMN IF NOT EXISTS payment_approved_on date;
