-- Migration 032: tighten the notification fan-out recipients.
--
-- Migration 031 fanned every notification out to ALL active SERVICE_ADVISORs.
-- That broke deep links for branch-specific advisors: e.g. a Netivot painter
-- request fanned out to an Ashkelon-only advisor, who then could not open that
-- case (branch RLS) — clicking the notification dead-ended.
--
-- Fix: fan out only to recipients who can actually open ANY case — all CEOs
-- (CEO bypass) and SERVICE_ADVISORs flagged sees_all_branches. A branch-specific
-- advisor still gets their own branch's notifications via branch_recipients().
-- Pairs with the new /go/[id] role-aware deep-link route.

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
