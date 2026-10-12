-- Parts returns: invoice photos (Amit, 2026-10-12). The warehouse photographs
-- the supplier's ORIGINAL invoice as soon as it arrives (in Ashkelon the
-- paper reaches the warehouse a day or two late with the driver), and the
-- CREDIT invoice when it comes — so the two can be matched later. Paths in
-- the existing private bucket "part-returns" (service-client access only).
-- Additive, idempotent. document_number (already there) = original invoice no.
ALTER TABLE public.part_returns ADD COLUMN IF NOT EXISTS invoice_path text;
ALTER TABLE public.part_returns ADD COLUMN IF NOT EXISTS credit_invoice_path text;
