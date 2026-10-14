-- Painters photograph invoices / delivery notes (Amit, 2026-10-14) and see
-- only what they photographed themselves (the full archive stays with the
-- returns-tracking roles via supplier_documents_select).
CREATE POLICY supplier_documents_own_select ON public.supplier_documents FOR SELECT TO authenticated
USING (created_by = (SELECT auth.uid()));
