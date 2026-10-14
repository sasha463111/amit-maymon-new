-- Replacement cars v2 (Amit, 2026-10-14): merged with the garage's paper forms
-- ("טופס מסירת/קבלת רכב חליפי", "טופס רכב חליפי", "ביטול השתתפות עצמית").
-- customer_car_model; optional deductible waiver (75 ₪ + VAT a day, max 525 ₪
-- + VAT) with its dates; the customer's signature at return; a personal link
-- (only the SHA-256 is stored) to the signed documents, sent to the customer
-- on WhatsApp. Credit-card details are deliberately NOT stored (PCI).
ALTER TABLE public.loaner_handovers
  ADD COLUMN IF NOT EXISTS customer_car_model   text,
  ADD COLUMN IF NOT EXISTS waiver               boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waiver_from          date,
  ADD COLUMN IF NOT EXISTS waiver_to            date,
  ADD COLUMN IF NOT EXISTS return_signature_path text,
  ADD COLUMN IF NOT EXISTS share_token_hash     text UNIQUE,
  ADD COLUMN IF NOT EXISTS share_expires_at     timestamptz;
