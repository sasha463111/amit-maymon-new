-- Migration 031: fan out EVERY notification to all CEOs AND all SERVICE_ADVISORs.
--
-- Replaces the migration-027 trigger which (a) fanned out to CEOs only and
-- (b) used a 5-minute de-dup window that silently swallowed legitimately
-- repeated events (e.g. a CEO who opened several painter requests on one case a
-- few minutes apart got only the first one). Amit wants the CEO and the service
-- advisor to see EVERYTHING, always.
--
-- Changes vs 027:
--   * recipients: role IN ('CEO','SERVICE_ADVISOR') instead of just 'CEO'
--   * recursion guard: pg_trigger_depth() > 1 (the copies we insert re-fire this
--     trigger one level deeper; stop there). This also lets a notification that
--     ORIGINALLY targets a CEO/advisor still fan out to the other overseers,
--     which the old role-based guard blocked.
--   * de-dup window: 10 seconds (only collapses the per-event fan-in — the app
--     inserts one row per role-target, each firing this trigger — while letting
--     distinct repeats of the same action each notify).

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
    AND p.role IN ('CEO', 'SERVICE_ADVISOR')
    AND p.id <> NEW.user_id
    AND (NEW.triggered_by IS NULL OR p.id <> NEW.triggered_by)
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
