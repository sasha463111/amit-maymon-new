-- ש.י.ר monthly batch (Amit, 2026-10-14): all invoices of a month are paid
-- together, שוטף 60, on the 7th of the third month (June → 7/9), minus
-- offsets, without blocked invoices. A payer's agreement can now count from
-- the invoice month (basis INVOICE) instead of the payment approval date.
ALTER TABLE public.insurer_payment_terms
  ADD COLUMN IF NOT EXISTS basis text NOT NULL DEFAULT 'APPROVAL' CHECK (basis IN ('APPROVAL', 'INVOICE'));
UPDATE public.insurer_payment_terms
  SET basis = 'INVOICE', mode = 'MONTHLY', offset_months = 3, pay_day = 7, cutoff_day = NULL,
      agreement = 'ריכוז חודשי — שוטף 60, ב-7 לחודש',
      notes = 'כל החשבוניות של חודש משולמות יחד, פחות קיזוזים, בלי חסומות. חשבוניות יוני → 7/9',
      updated_at = now()
  WHERE insurer = 'מוקד ש.י.ר';

-- "חסומה": an invoice the payer blocked — not paid with its month.
ALTER TABLE public.collection_cases DROP CONSTRAINT IF EXISTS collection_cases_status_check;
ALTER TABLE public.collection_cases ADD CONSTRAINT collection_cases_status_check
  CHECK (status IN ('OPEN', 'PARTIAL', 'PAID', 'DISPUTE', 'LEGAL', 'BLOCKED'));
