-- One finance row per case (Ilana enters it on the closure screen, 2026-10-14).
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_closures_case ON public.finance_closures (case_id) WHERE case_id IS NOT NULL;
ALTER TABLE public.finance_closures ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id);
