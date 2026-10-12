-- Parts returns & credits (Amit's spec, 2026-10-12). Replaces, in parallel
-- at first, his Google Forms/Sheets system ("פתיחת החזרת חלק", "אישור איסוף
-- חלק על ידי ספק", "מעקב זיכויים"). Idempotent.
--
-- Flow: WAITING_PICKUP (marked + sticker photo, part in the returns area)
--    → COLLECTED (handed to the supplier's driver)
--    → CREDITED (credit invoice received)   | DISPUTE (rare, Roei/Amit) | CANCELLED
--
-- Who: mark — painters, service advisors/manager, warehouse; hand over —
-- warehouse, advisors, CEO; credit — warehouse manager (Roei), CEO.
-- Painters see only what they marked themselves.

-- ---- permission matrix stays complete: new roles get every action OFF -------
INSERT INTO public.role_permissions (role, action, enabled)
SELECT r.role::public.user_role, a.action, false
FROM (VALUES ('WAREHOUSE'), ('WAREHOUSE_MANAGER')) AS r(role)
CROSS JOIN (SELECT DISTINCT action FROM public.role_permissions) AS a
ON CONFLICT (role, action) DO NOTHING;

-- ---- table ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.part_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  case_id uuid REFERENCES public.cases(id),          -- null = "כללי" (no case)
  plate text,                                         -- digits only
  supplier text NOT NULL,                             -- one of the list, or "אחר"
  supplier_other text,
  sku text,
  description text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  reason text NOT NULL,
  reason_other text,
  document_number text,                               -- invoice / delivery note
  sticker_path text NOT NULL,                         -- storage: part-returns bucket
  notes text,
  status text NOT NULL DEFAULT 'WAITING_PICKUP'
    CHECK (status IN ('WAITING_PICKUP', 'COLLECTED', 'CREDITED', 'DISPUTE', 'CANCELLED')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  collected_at timestamptz,
  collected_by uuid REFERENCES public.profiles(id),
  driver_name text,
  credit_invoice_number text,
  credit_amount numeric(12,2),
  credited_at timestamptz,
  credited_by uuid REFERENCES public.profiles(id),
  dispute_note text,
  alert7_sent_at timestamptz,
  alert14_sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_returns_status ON public.part_returns (status, created_at);
CREATE INDEX IF NOT EXISTS idx_part_returns_case ON public.part_returns (case_id);
CREATE INDEX IF NOT EXISTS idx_part_returns_created_by ON public.part_returns (created_by);

ALTER TABLE public.part_returns ENABLE ROW LEVEL SECURITY;

-- Who sees the full tracking.
CREATE OR REPLACE FUNCTION public.can_track_part_returns()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_active
      AND role::text IN ('CEO', 'SERVICE_ADVISOR', 'SERVICE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_MANAGER')
  );
$$;

DROP POLICY IF EXISTS part_returns_select ON public.part_returns;
CREATE POLICY part_returns_select ON public.part_returns FOR SELECT TO authenticated
USING (
  created_by = (SELECT auth.uid())
  OR (public.can_track_part_returns()
      AND (public.can_see_all_branches() OR branch_id = ANY (public.get_my_branch_ids())))
);

DROP POLICY IF EXISTS part_returns_insert ON public.part_returns;
CREATE POLICY part_returns_insert ON public.part_returns FOR INSERT TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active
              AND role::text IN ('CEO', 'SERVICE_ADVISOR', 'SERVICE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_MANAGER', 'PAINTER'))
  AND (public.can_see_all_branches() OR branch_id = ANY (public.get_my_branch_ids()))
);

-- Status changes (hand-over, credit) — the server actions narrow it further.
DROP POLICY IF EXISTS part_returns_update ON public.part_returns;
CREATE POLICY part_returns_update ON public.part_returns FOR UPDATE TO authenticated
USING (public.can_track_part_returns()
       AND (public.can_see_all_branches() OR branch_id = ANY (public.get_my_branch_ids())))
WITH CHECK (public.can_track_part_returns()
       AND (public.can_see_all_branches() OR branch_id = ANY (public.get_my_branch_ids())));

-- ---- sticker photos: private bucket, read/written only by the server --------
INSERT INTO storage.buckets (id, name, public)
VALUES ('part-returns', 'part-returns', false)
ON CONFLICT (id) DO NOTHING;

-- ---- notifications: who gets which part-returns alert ------------------------
-- New return → warehouse; not collected 7 days → warehouse manager (Roei);
-- 14 days → CEO. Amit asked for exactly that, so the CEO does NOT get every
-- new return (an exception to "CEO gets everything").
CREATE OR REPLACE FUNCTION public.notification_kind(p_type text, p_title text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_type IN ('PART_RETURN_NEW', 'PART_RETURN_OVERDUE_7', 'PART_RETURN_OVERDUE_14') THEN p_type
    WHEN p_type = 'DIRECT_NOTE'                          THEN 'NOTE'
    WHEN p_title LIKE 'תזכורת — רכב ממתין לעבודה%'       THEN 'PAINTER_REMINDER'
    WHEN p_type = 'PAINTER_REQUEST'                      THEN 'PAINTER_REQUEST'
    WHEN p_title LIKE 'הבקשה שלך%'                       THEN 'PAINTER_ANSWER'
    WHEN p_title LIKE 'רכב נכנס לעבודה%'                 THEN 'ENTER_WORK'
    WHEN p_title LIKE 'חלקים הגיעו%'                     THEN 'PARTS_ARRIVED'
    WHEN p_type = 'READY_FOR_OFFICE'                     THEN 'CLOSURE'
    WHEN p_title LIKE '%הפני%'                           THEN 'REFERRAL'
    WHEN p_title LIKE 'תיק חדש נפתח%'                    THEN 'NEW_CASE'
    ELSE 'CASE_FLOW'
  END
$$;

CREATE OR REPLACE FUNCTION public.notification_is_relevant(p_role text, p_office_function text, p_kind text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_kind = 'PART_RETURN_NEW'        THEN p_role = 'WAREHOUSE'
    WHEN p_kind = 'PART_RETURN_OVERDUE_7'  THEN p_role = 'WAREHOUSE_MANAGER'
    WHEN p_kind = 'PART_RETURN_OVERDUE_14' THEN p_role = 'CEO'
    WHEN p_role = 'CEO' THEN true
    WHEN p_kind = 'NOTE' THEN true
    WHEN p_role IN ('SERVICE_ADVISOR', 'SERVICE_MANAGER') THEN
      p_kind IN ('PAINTER_REQUEST', 'NEW_CASE', 'CASE_FLOW', 'ENTER_WORK', 'PARTS_ARRIVED')
    WHEN p_role = 'PAINTER' THEN
      p_kind IN ('ENTER_WORK', 'PARTS_ARRIVED', 'PAINTER_REMINDER', 'PAINTER_ANSWER')
    WHEN p_role = 'OFFICE' AND p_office_function = 'REFERRALS' THEN p_kind = 'REFERRAL'
    WHEN p_role = 'OFFICE' AND p_office_function = 'CLOSURE'   THEN p_kind = 'CLOSURE'
    WHEN p_role = 'OFFICE' THEN p_kind IN ('REFERRAL', 'CLOSURE')
    ELSE false
  END
$$;
