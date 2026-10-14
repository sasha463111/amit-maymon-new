-- Collection cases linked straight to the repair case and the referral (Amit,
-- 2026-10-14: "ניירת שיש לנו כבר סרוק — לא יהיה צורך בסריקה נוספת"; data we
-- already typed is pulled by plate + accident date — the same customer can
-- have several accidents, so opening a case asks "existing or new?").
-- Until now the only path was via finance_closures, which most BAFI claims don't have.
ALTER TABLE public.collection_cases
  ADD COLUMN IF NOT EXISTS case_id     uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_id uuid REFERENCES public.referrals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_collection_cases_case ON public.collection_cases (case_id);

-- Beta feedback from the collectors ("כל חלום שלהן", Amit). Server-only.
CREATE TABLE IF NOT EXISTS public.beta_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area        text NOT NULL DEFAULT 'collections',
  kind        text NOT NULL DEFAULT 'IDEA' CHECK (kind IN ('IDEA', 'PROBLEM', 'DREAM')),
  body        text NOT NULL,
  page        text,
  status      text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'PLANNED', 'DONE', 'NO')),
  reply       text,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_created ON public.beta_feedback (created_at DESC);
ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beta_feedback FROM anon, authenticated;
