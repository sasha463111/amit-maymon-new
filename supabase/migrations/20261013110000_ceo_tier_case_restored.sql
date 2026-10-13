-- A written-off case brought back to treatment by someone other than the CEO
-- tells the CEO with a push (Amit, 2026-10-13): CASE_RESTORED joins the
-- ACTION tier of ceo_notification_tier (see 20261012180000).
CREATE OR REPLACE FUNCTION public.ceo_notification_tier(p_type text, p_title text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN p_type IN ('PENDING_APPROVAL', 'APPROVAL_NEEDED', 'APPROVAL_REQUIRED',
                    'DIRECT_NOTE', 'PART_RETURN_OVERDUE_14', 'CASE_RESTORED') THEN 'ACTION'
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
