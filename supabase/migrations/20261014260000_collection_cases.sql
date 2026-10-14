-- Collection cases (Amit, 2026-10-14): a collector opens a case by plate
-- ("פתיחת תיק"); the data is pulled from finance_closures and anything missing
-- is typed. The case belongs to her — output, average working days and delays
-- are measured per collector. Partial payment records the offset amount and
-- reason; a case moved to the legal department records date, lawyer, claimed
-- amount and the final recovered amount. Server-only (RLS on, no grants).
-- (finance_collections from 20261014230100 is superseded and left unused.)
CREATE TABLE IF NOT EXISTS public.collection_cases (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_closure_id     uuid REFERENCES public.finance_closures(id) ON DELETE SET NULL,
  assigned_to            uuid NOT NULL REFERENCES public.profiles(id),
  opened_at              timestamptz NOT NULL DEFAULT now(),
  closed_at              timestamptz,
  -- snapshot from finance_closures, editable by the collector
  branch_id              uuid REFERENCES public.branches(id),
  plate                  text NOT NULL,
  customer_name          text,
  work_source            text NOT NULL DEFAULT 'DIRECT' CHECK (work_source IN ('DIRECT', 'SHIR', 'IDF')),
  insurer                text,
  claim_type             text,
  case_closed_on         date,
  invoice_number         text,
  amount_due             numeric(12,2) CHECK (amount_due >= 0),
  vat_offset             numeric(12,2) CHECK (vat_offset >= 0),
  reinstatement          numeric(12,2) CHECK (reinstatement >= 0),
  claim_check_due_date   date,
  claim_check_amount     numeric(12,2) CHECK (claim_check_amount >= 0),
  -- collection work
  payment_approved_on    date,
  status                 text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PARTIAL', 'PAID', 'DISPUTE', 'LEGAL')),
  received_amount        numeric(12,2) CHECK (received_amount >= 0),
  received_on            date,
  partial_reason         text,
  offset_amount          numeric(12,2) CHECK (offset_amount >= 0),
  note                   text,
  -- legal department
  legal_sent_on          date,
  legal_lawyer           text,
  legal_claim_amount     numeric(12,2) CHECK (legal_claim_amount >= 0),
  legal_closed_on        date,
  legal_recovered_amount numeric(12,2) CHECK (legal_recovered_amount >= 0),
  created_by             uuid REFERENCES public.profiles(id),
  updated_by             uuid REFERENCES public.profiles(id),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_cases_finance ON public.collection_cases (finance_closure_id) WHERE finance_closure_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collection_cases_assigned ON public.collection_cases (assigned_to, closed_at);
CREATE INDEX IF NOT EXISTS idx_collection_cases_plate ON public.collection_cases (plate);
ALTER TABLE public.collection_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.collection_cases FROM anon, authenticated;
