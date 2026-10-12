-- Closure status updates (Amit, 2026-10-12): Ilana types a manual "סטטוס"
-- for a case in closure, kept as a log (like the referrals' "מעקב הפנייה"),
-- and the latest one is shown prominently on the closure card, outside the
-- case. Additive, idempotent.

-- Latest update, denormalized onto the case for the closure list.
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS closure_status_note text;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS closure_status_at timestamptz;

CREATE TABLE IF NOT EXISTS public.closure_status_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id),
  note text NOT NULL CHECK (length(trim(note)) > 0),
  created_by uuid NOT NULL REFERENCES public.profiles(id) DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_closure_status_updates_case ON public.closure_status_updates (case_id, created_at DESC);

ALTER TABLE public.closure_status_updates ENABLE ROW LEVEL SECURITY;

-- Office and CEO (the closure page's audience); the case must be visible to
-- the user (cases RLS applies inside EXISTS → branch isolation).
DROP POLICY IF EXISTS closure_status_updates_select ON public.closure_status_updates;
CREATE POLICY closure_status_updates_select ON public.closure_status_updates FOR SELECT TO authenticated
USING (public.get_my_role()::text IN ('OFFICE', 'CEO') AND EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id));

DROP POLICY IF EXISTS closure_status_updates_insert ON public.closure_status_updates;
CREATE POLICY closure_status_updates_insert ON public.closure_status_updates FOR INSERT TO authenticated
WITH CHECK (created_by = (SELECT auth.uid())
  AND public.get_my_role()::text IN ('OFFICE', 'CEO')
  AND EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id));
