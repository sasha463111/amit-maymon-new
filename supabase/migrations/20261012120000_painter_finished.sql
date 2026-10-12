-- "סיום עבודה" for the painters (Amit, 2026-10-12): the painter marks his
-- work done; the case leaves the painters board ONLY — it stays in "תיקים"
-- and continues until the office closes it. Additive, idempotent.
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS painter_finished_at timestamptz;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS painter_finished_by uuid REFERENCES public.profiles(id);
