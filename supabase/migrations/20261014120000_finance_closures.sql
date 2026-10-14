-- Finance data (Amit, 2026-10-14): one row per closed job with its invoice —
-- the data Ilana kept in Excel ("הזנת נתונים"). Feeds the CEO-only finance
-- dashboard (/finance). Historical rows come from the Excel import
-- (source = 'EXCEL_IMPORT', import_key keeps the import idempotent).
CREATE TABLE IF NOT EXISTS public.finance_closures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closed_on       date NOT NULL,
  branch_id       uuid NOT NULL REFERENCES public.branches(id),
  plate           text,
  customer_name   text,
  job_card_no     text,
  case_id         uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  -- הסדר ישיר תהילה / מוקד ש.י.ר / צה"ל
  work_source     text NOT NULL DEFAULT 'DIRECT' CHECK (work_source IN ('DIRECT', 'SHIR', 'IDF')),
  insurer         text,           -- null for ש.י.ר (insurer not known to us)
  claim_type      text,           -- פוליסה / צד ג' / הסדר ג'
  idf_category    text,
  appraiser       text,
  amount_ours     numeric(12,2) NOT NULL CHECK (amount_ours >= 0),  -- incl. VAT, with our discounts
  amount_shir     numeric(12,2) CHECK (amount_shir >= 0),            -- ש.י.ר: incl. VAT, without discounts
  invoice_number  text,
  deductible      numeric(12,2) CHECK (deductible >= 0),
  review_note     text,           -- import doubts awaiting Amit
  source          text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'EXCEL_IMPORT')),
  import_key      text UNIQUE,
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_closures_closed_on ON public.finance_closures (closed_on);
CREATE INDEX IF NOT EXISTS idx_finance_closures_branch ON public.finance_closures (branch_id);
CREATE INDEX IF NOT EXISTS idx_finance_closures_case ON public.finance_closures (case_id);

ALTER TABLE public.finance_closures ENABLE ROW LEVEL SECURITY;

-- CEO only (new modules start CEO-only — Amit).
CREATE OR REPLACE FUNCTION public.is_active_ceo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role::text = 'CEO');
$$;
REVOKE EXECUTE ON FUNCTION public.is_active_ceo() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_active_ceo() TO authenticated;

CREATE POLICY finance_closures_ceo ON public.finance_closures FOR ALL TO authenticated
USING (public.is_active_ceo())
WITH CHECK (public.is_active_ceo());

REVOKE ALL ON public.finance_closures FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_closures TO authenticated;
