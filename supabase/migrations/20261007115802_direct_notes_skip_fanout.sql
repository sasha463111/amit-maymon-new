-- הערות אישיות (DIRECT_NOTE) לא מועתקות אוטומטית (07.10.2026).
-- אילנה שולחת הערה בחופשיות למי שהיא בוחרת ("לנסיה וערן — הערה ספציפית").
-- מנגנון ההעתקה מעתיק כל התראה לכל המנכ"לים ולנסיה — אז הערה לערן הייתה
-- מגיעה גם לנסיה. הערה אישית מגיעה רק למי שנבחר; מי שרוצה שעמית יראה, בוחר אותו.
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

  -- הערה אישית: רק לנמענים שנבחרו.
  IF NEW.type = 'DIRECT_NOTE' THEN
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
