-- Migration 027 — CEO receives EVERY in-app notification, always.
--
-- Requirement: the CEO must get every possible notification (current and future
-- types) without each emit site having to remember to add CEOs. A single
-- AFTER INSERT trigger on notifications fans out each row to all active CEOs.
--
-- Safety:
--   * Recursion guard — the copies we insert target CEOs, and the trigger
--     returns early for any row whose recipient is a CEO, so it never loops.
--   * Dedup — an event that notifies N non-CEO recipients (e.g. 4 advisors)
--     still yields exactly ONE copy per CEO, matched on
--     (case_id, type, title, triggered_by) within a 5-minute window.
--   * A CEO is not notified about their own action (triggered_by = that CEO).
--
-- Push: this trigger only creates the in-app rows. Sites that should also push
-- to the CEO (e.g. CLOSE_CASE) push explicitly in the server action.

CREATE OR REPLACE FUNCTION public.fanout_notifications_to_ceos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE id = NEW.user_id AND role = 'CEO') THEN
    RETURN NEW;
  END IF;
  INSERT INTO notifications (user_id, case_id, type, title, body, action_url, triggered_by, read)
  SELECT p.id, NEW.case_id, NEW.type, NEW.title, NEW.body, NEW.action_url, NEW.triggered_by, false
  FROM profiles p
  WHERE p.role = 'CEO' AND p.is_active = true
    AND (NEW.triggered_by IS NULL OR p.id <> NEW.triggered_by)
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = p.id
        AND n.case_id IS NOT DISTINCT FROM NEW.case_id
        AND n.type = NEW.type AND n.title = NEW.title
        AND n.triggered_by IS NOT DISTINCT FROM NEW.triggered_by
        AND n.created_at > now() - interval '5 minutes'
    );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fanout_notifications_to_ceos ON notifications;
CREATE TRIGGER trg_fanout_notifications_to_ceos
  AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION public.fanout_notifications_to_ceos();
