-- Supplier invoices / delivery notes archive inside "החזרות" (Amit, 2026-10-14):
-- every photographed invoice or delivery note, by branch and date, searchable.
-- Double check (Amit, 14/10): a different user marks "✓ נבדק".
-- Photos live in the private part-returns bucket (server-side, signed URLs).
CREATE TABLE IF NOT EXISTS public.supplier_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       uuid NOT NULL REFERENCES public.branches(id),
  doc_type        text NOT NULL CHECK (doc_type IN ('INVOICE', 'DELIVERY_NOTE', 'CREDIT_INVOICE')),
  supplier        text NOT NULL,
  doc_number      text,
  doc_date        date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Jerusalem')::date,
  plate           text,
  amount          numeric(12,2) CHECK (amount >= 0),
  notes           text,
  photo_path      text NOT NULL,
  created_by      uuid NOT NULL REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  verified_by     uuid REFERENCES public.profiles(id),
  verified_at     timestamptz,
  CONSTRAINT supplier_documents_verifier_differs CHECK (verified_by IS NULL OR verified_by <> created_by)
);
CREATE INDEX IF NOT EXISTS idx_supplier_documents_branch_date ON public.supplier_documents (branch_id, doc_date DESC);

ALTER TABLE public.supplier_documents ENABLE ROW LEVEL SECURITY;

-- Same audience as the full returns tracking (can_track_part_returns + branch).
CREATE POLICY supplier_documents_select ON public.supplier_documents FOR SELECT TO authenticated
USING (public.can_track_part_returns()
       AND (public.can_see_all_branches() OR branch_id = ANY (public.get_my_branch_ids())));

REVOKE ALL ON public.supplier_documents FROM anon;
GRANT SELECT ON public.supplier_documents TO authenticated;
-- Writes only through the server actions (service role).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.supplier_documents FROM authenticated;
