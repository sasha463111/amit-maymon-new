-- Collection case as a full file ("תיק גבייה", Amit 2026-10-14, after reviewing
-- the collectors' BAFI screens): the list stays the outer view, and inside the
-- case — claim details, appraiser figures, third party, contacts, a running log
-- ("טיפול שוטף") with reminders that also reach the phone, and documents.
-- Everything typed lands in our DB for reports. external_ref keeps the BAFI
-- internal number so an Excel import never creates duplicates.

ALTER TABLE public.collection_cases
  ADD COLUMN IF NOT EXISTS claim_number           text,
  ADD COLUMN IF NOT EXISTS claim_stage            text,
  ADD COLUMN IF NOT EXISTS event_date             date,
  ADD COLUMN IF NOT EXISTS customer_phone         text,
  ADD COLUMN IF NOT EXISTS claimed_amount         numeric(12,2) CHECK (claimed_amount >= 0),
  ADD COLUMN IF NOT EXISTS approved_amount        numeric(12,2) CHECK (approved_amount >= 0),
  ADD COLUMN IF NOT EXISTS appraiser_name         text,
  ADD COLUMN IF NOT EXISTS appraiser_phone        text,
  ADD COLUMN IF NOT EXISTS appraiser_email        text,
  ADD COLUMN IF NOT EXISTS appraiser_damage       numeric(12,2) CHECK (appraiser_damage >= 0),
  ADD COLUMN IF NOT EXISTS appraiser_fee          numeric(12,2) CHECK (appraiser_fee >= 0),
  ADD COLUMN IF NOT EXISTS depreciation           numeric(12,2) CHECK (depreciation >= 0),
  ADD COLUMN IF NOT EXISTS deductible             numeric(12,2) CHECK (deductible >= 0),
  ADD COLUMN IF NOT EXISTS salvage_value          numeric(12,2) CHECK (salvage_value >= 0),
  ADD COLUMN IF NOT EXISTS extra_expenses         numeric(12,2) CHECK (extra_expenses >= 0),
  ADD COLUMN IF NOT EXISTS insurer_handler        text,
  ADD COLUMN IF NOT EXISTS insurer_handler_phone  text,
  ADD COLUMN IF NOT EXISTS insurer_handler_email  text,
  ADD COLUMN IF NOT EXISTS tp_plate               text,
  ADD COLUMN IF NOT EXISTS tp_insurer             text,
  ADD COLUMN IF NOT EXISTS tp_claim_number        text,
  ADD COLUMN IF NOT EXISTS tp_owner_name          text,
  ADD COLUMN IF NOT EXISTS tp_owner_phone         text,
  ADD COLUMN IF NOT EXISTS legal_claim_number     text,
  ADD COLUMN IF NOT EXISTS external_ref           text,
  ADD COLUMN IF NOT EXISTS source                 text NOT NULL DEFAULT 'APP';

CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_cases_external_ref ON public.collection_cases (external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collection_cases_claim_number ON public.collection_cases (claim_number);

-- "טיפול שוטף": one row per action. A row with remind_at is a reminder; the
-- cron pushes it to remind_user once (reminded_at) and it stays open in the
-- case until marked done (remind_done_at).
CREATE TABLE IF NOT EXISTS public.collection_case_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid NOT NULL REFERENCES public.collection_cases(id) ON DELETE CASCADE,
  kind            text NOT NULL DEFAULT 'NOTE' CHECK (kind IN ('NOTE', 'CALL', 'EMAIL', 'STATUS', 'DOC', 'SYSTEM')),
  body            text NOT NULL,
  remind_at       timestamptz,
  remind_user     uuid REFERENCES public.profiles(id),
  reminded_at     timestamptz,
  remind_done_at  timestamptz,
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collection_event_reminder_user CHECK (remind_at IS NULL OR remind_user IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_collection_events_case ON public.collection_case_events (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_events_due ON public.collection_case_events (remind_at)
  WHERE remind_at IS NOT NULL AND reminded_at IS NULL AND remind_done_at IS NULL;

CREATE TABLE IF NOT EXISTS public.collection_case_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES public.collection_cases(id) ON DELETE CASCADE,
  file_path    text NOT NULL,
  file_name    text,
  mime_type    text,
  file_size    bigint,
  label        text,
  uploaded_by  uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_collection_files_case ON public.collection_case_files (case_id, created_at DESC);

-- Server-only, like collection_cases: read/written through server actions after the role check.
ALTER TABLE public.collection_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_case_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.collection_case_events, public.collection_case_files FROM anon, authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('collection-docs', 'collection-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Reminder notifications: only to the person the reminder is for — never
-- fanned out to the CEOs (like DIRECT_NOTE), and pushed to a CEO who set one.
CREATE OR REPLACE FUNCTION public.notification_kind(p_type text, p_title text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_type IN ('PART_RETURN_NEW', 'PART_RETURN_OVERDUE_7', 'PART_RETURN_OVERDUE_14',
                    'SUPPLIER_STATEMENT_REMINDER', 'SUPPLIER_STATEMENT_FYI',
                    'COLLECTION_REMINDER') THEN p_type
    WHEN p_type = 'CUSTOMER_DOCS'                        THEN 'REFERRAL'
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
$function$;

CREATE OR REPLACE FUNCTION public.notification_is_relevant(p_role text, p_office_function text, p_kind text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_kind = 'PART_RETURN_NEW'             THEN p_role = 'WAREHOUSE'
    WHEN p_kind = 'PART_RETURN_OVERDUE_7'       THEN p_role = 'WAREHOUSE_MANAGER'
    WHEN p_kind = 'PART_RETURN_OVERDUE_14'      THEN p_role = 'CEO'
    WHEN p_kind = 'SUPPLIER_STATEMENT_REMINDER' THEN p_role = 'WAREHOUSE_MANAGER'
    WHEN p_kind = 'SUPPLIER_STATEMENT_FYI'      THEN p_role = 'CEO'
    WHEN p_kind = 'COLLECTION_REMINDER'         THEN p_role IN ('COLLECTIONS', 'ACCOUNTANT', 'CEO')
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
$function$;

CREATE OR REPLACE FUNCTION public.ceo_notification_tier(p_type text, p_title text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_type IN ('PENDING_APPROVAL', 'APPROVAL_NEEDED', 'APPROVAL_REQUIRED',
                    'DIRECT_NOTE', 'PART_RETURN_OVERDUE_14', 'CASE_RESTORED',
                    'SUPPLIER_STATEMENT_FYI', 'COLLECTION_REMINDER') THEN 'ACTION'
    WHEN p_title LIKE 'תזכורת — רכב ממתין לעבודה%'
      OR p_title LIKE 'חלקים הגיעו%'
      OR p_title LIKE 'הבקשה שלך%'
      OR p_title LIKE 'טפסי גלגלים%'
      OR p_title LIKE 'אומדן ופרטי תיק אושר%'
      OR p_type = 'WASH_STARTED'
      OR p_type = 'BLOCKED_ACTION' THEN 'DROP'
    ELSE 'INFO'
  END
$function$;

CREATE OR REPLACE FUNCTION public.fanout_notifications_to_ceos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- הערה אישית / תזכורת גבייה: רק לנמען שנבחר.
  IF NEW.type IN ('DIRECT_NOTE', 'COLLECTION_REMINDER') THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, case_id, type, title, body, action_url, triggered_by, read)
  SELECT p.id, NEW.case_id, NEW.type, NEW.title, NEW.body, NEW.action_url, NEW.triggered_by, false
  FROM profiles p
  WHERE p.is_active = true
    AND (p.role = 'CEO' OR (p.role = 'SERVICE_ADVISOR' AND p.sees_all_branches = true))
    AND p.id <> NEW.user_id
    AND (p.role = 'CEO' OR NEW.triggered_by IS NULL OR p.id <> NEW.triggered_by)
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = p.id
        AND n.case_id IS NOT DISTINCT FROM NEW.case_id
        AND n.type = NEW.type AND n.title = NEW.title
        AND n.triggered_by IS NOT DISTINCT FROM NEW.triggered_by
        AND n.created_at > now() - interval '10 seconds'
    );
  RETURN NEW;
END $function$;
