-- Collections financial dashboard (/receivables, Amit 2026-10-14): the CEO
-- plus people he approves. A user can read only their own row (the menu
-- checks it); granting/revoking goes through the server (CEO only).
CREATE TABLE IF NOT EXISTS public.finance_viewers (
  user_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id),
  granted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_viewers ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_viewers_own ON public.finance_viewers FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.finance_viewers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.finance_viewers FROM authenticated;
GRANT SELECT ON public.finance_viewers TO authenticated;
