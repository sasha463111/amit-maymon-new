-- Collections screen (/collections, Amit 2026-10-14). Collectors see only what
-- they need from finance_closures (invoice amount, claims-cheque due date,
-- VAT offset, reinstatement) — read through the server, never the table.
-- Their own work (status, received amount/date, note) lives in
-- finance_collections; server-only (RLS on, no policies, no grants).

-- permission matrix stays complete: the new role gets every action OFF
INSERT INTO public.role_permissions (role, action, enabled)
SELECT 'COLLECTIONS'::public.user_role, a.action, false
FROM (SELECT DISTINCT action FROM public.role_permissions) AS a
ON CONFLICT (role, action) DO NOTHING;

-- Ilana's closure card: VAT offset (קיזוז מע"מ), reinstatement (כינון),
-- appraiser fee (שכר טרחת שמאי, צד ג').
ALTER TABLE public.finance_closures
  ADD COLUMN IF NOT EXISTS vat_offset     numeric(12,2) CHECK (vat_offset >= 0),
  ADD COLUMN IF NOT EXISTS reinstatement  numeric(12,2) CHECK (reinstatement >= 0),
  ADD COLUMN IF NOT EXISTS appraiser_fee  numeric(12,2) CHECK (appraiser_fee >= 0);

CREATE TABLE IF NOT EXISTS public.finance_collections (
  finance_closure_id uuid PRIMARY KEY REFERENCES public.finance_closures(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PARTIAL', 'PAID', 'DISPUTE')),
  received_amount numeric(12,2) CHECK (received_amount >= 0),
  received_on     date,
  note            text,
  updated_by      uuid REFERENCES public.profiles(id),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_collections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_collections FROM anon, authenticated;
