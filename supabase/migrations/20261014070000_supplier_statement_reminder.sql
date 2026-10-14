-- Monthly reminder (Amit, 2026-10-14): ask every supplier for its statement
-- (כרטסת) and reconcile it against the returns module. Roey
-- (WAREHOUSE_MANAGER) gets SUPPLIER_STATEMENT_REMINDER; Amit gets
-- SUPPLIER_STATEMENT_FYI ("Roey was reminded") with a push (ACTION tier).
-- Everything else in the three functions is unchanged.

CREATE OR REPLACE FUNCTION public.notification_kind(p_type text, p_title text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_type IN ('PART_RETURN_NEW', 'PART_RETURN_OVERDUE_7', 'PART_RETURN_OVERDUE_14',
                    'SUPPLIER_STATEMENT_REMINDER', 'SUPPLIER_STATEMENT_FYI') THEN p_type
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
AS $$
  SELECT CASE
    WHEN p_type IN ('PENDING_APPROVAL', 'APPROVAL_NEEDED', 'APPROVAL_REQUIRED',
                    'DIRECT_NOTE', 'PART_RETURN_OVERDUE_14', 'CASE_RESTORED',
                    'SUPPLIER_STATEMENT_FYI') THEN 'ACTION'
    WHEN p_title LIKE 'תזכורת — רכב ממתין לעבודה%'
      OR p_title LIKE 'חלקים הגיעו%'
      OR p_title LIKE 'הבקשה שלך%'
      OR p_title LIKE 'טפסי גלגלים%'
      OR p_title LIKE 'אומדן ופרטי תיק אושר%'
      OR p_type = 'WASH_STARTED'
      OR p_type = 'BLOCKED_ACTION' THEN 'DROP'
    ELSE 'INFO'
  END
$$;
