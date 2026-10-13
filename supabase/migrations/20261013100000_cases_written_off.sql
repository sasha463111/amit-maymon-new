-- "רכב לא לתיקון / מושבת" (Amit, 2026-10-13): a car that will not be repaired
-- (total loss, customer took it elsewhere, …). The case is closed (closed_at)
-- and kept in its own archive tab "מושבתים" instead of "סגורים". Additive,
-- idempotent; RLS of cases already covers the new columns.
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS written_off_at timestamptz;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS written_off_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS written_off_reason text;
