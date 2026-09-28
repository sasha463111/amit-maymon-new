-- Migration 041: CEOs should see notifications for their own actions too.
--
-- Until now, the fan-out trigger (031/032) deliberately excluded the actor
-- (NEW.triggered_by) from the CEO/cross-branch-advisor copy, on the
-- assumption that nobody wants a notification about their own action. The
-- CEO explicitly asked for the opposite for their own account: they want to
-- see EVERY notification, including ones they triggered themselves, so they
-- can use the notifications feed as a full activity/audit trail ("שאוכל
-- לעקוב"). SERVICE_ADVISOR cross-branch recipients keep the old behavior —
-- only CEOs get their own actions back.
--
-- The direct/primary notification (the actual target of the action, e.g. the
-- painter whose request was answered) is untouched — this only changes the
-- CEO oversight copy.

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

INSERT INTO schema_migrations (filename) VALUES ('041_ceo_sees_own_notifications.sql')
ON CONFLICT (filename) DO NOTHING;
