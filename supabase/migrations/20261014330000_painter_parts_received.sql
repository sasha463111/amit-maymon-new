-- "התקבלה תוספת החלקים" (Amit, 2026-10-14): after an advisor marks a painter's
-- PARTS request done, the painter confirms the extra parts actually reached him.
ALTER TABLE public.painter_requests
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES public.profiles(id);
