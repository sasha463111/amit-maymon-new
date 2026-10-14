-- Double-entry guard (Amit, 2026-10-14): when data that looks like an existing
-- entry is typed again, the user is warned and must confirm ("two separate
-- damages" / "a new document"). The confirmation is kept for audit.
ALTER TABLE public.finance_closures
  ADD COLUMN IF NOT EXISTS duplicate_confirmed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS duplicate_confirmed_at timestamptz;
ALTER TABLE public.supplier_documents
  ADD COLUMN IF NOT EXISTS duplicate_confirmed_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_finance_closures_plate ON public.finance_closures (plate);
CREATE INDEX IF NOT EXISTS idx_supplier_documents_number ON public.supplier_documents (lower(doc_number));
