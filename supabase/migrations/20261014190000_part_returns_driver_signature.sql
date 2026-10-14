-- Driver's signature at hand-over (Amit, 2026-10-14): one PNG per hand-over
-- batch in the private part-returns bucket (signatures/…), on every part in it.
ALTER TABLE public.part_returns ADD COLUMN IF NOT EXISTS driver_signature_path text;
