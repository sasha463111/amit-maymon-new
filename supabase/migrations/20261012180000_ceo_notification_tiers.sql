-- CEO notification diet (Amit approved 2026-10-12). He got ~145 notifications
-- a day; ~5 needed him. Three tiers for the CEO only — nothing changes for
-- any other role:
--   ACTION → bell "לטיפולי" + push: approvals waiting for him, notes/messages
--            sent to him, a part return 14 days without credit.
--   INFO   → bell only, no push (the bell groups them one row per car).
--   DROP   → not stored for the CEO at all (painter reminders, parts arrived,
--            painter-request answers, wash, wheels forms, estimate approved —
--            he approved it himself — and other people's blocked actions).
--            These already appear in the 18:00 daily report.
-- Function-only changes, idempotent.

CREATE OR REPLACE FUNCTION public.ceo_notification_tier(p_type text, p_title text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN p_type IN ('PENDING_APPROVAL', 'APPROVAL_NEEDED', 'APPROVAL_REQUIRED',
                    'DIRECT_NOTE', 'PART_RETURN_OVERDUE_14') THEN 'ACTION'
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

CREATE OR REPLACE FUNCTION public.drop_irrelevant_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text;
  v_office text;
BEGIN
  SELECT role::text, office_function INTO v_role, v_office FROM public.profiles WHERE id = NEW.user_id;
  IF v_role IS NULL THEN RETURN NEW; END IF;
  -- CEO: drop the noise. His OWN blocked action still reaches him.
  IF v_role = 'CEO'
     AND public.ceo_notification_tier(NEW.type, NEW.title) = 'DROP'
     AND NOT (NEW.type = 'BLOCKED_ACTION' AND NEW.triggered_by IS NOT DISTINCT FROM NEW.user_id) THEN
    RETURN NULL;
  END IF;
  IF public.notification_is_relevant(v_role, v_office, public.notification_kind(NEW.type, NEW.title)) THEN
    RETURN NEW;
  END IF;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.dispatch_ceo_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_secret text;
BEGIN
  IF NEW.read THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.user_id AND p.is_active) THEN
    RETURN NEW;
  END IF;
  -- CEO: push only for what needs him; the rest waits quietly in the bell.
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.user_id AND p.role::text = 'CEO')
     AND public.ceo_notification_tier(NEW.type, NEW.title) <> 'ACTION' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'push_dispatch_secret' LIMIT 1;
  PERFORM net.http_post(
    url := 'https://amit-maymon-new-psi.vercel.app/api/push/dispatch',
    body := jsonb_build_object('id', NEW.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', coalesce(v_secret, '')),
    timeout_milliseconds := 10000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dispatch push failed for notification %: %', NEW.id, SQLERRM;
  RETURN NEW;
END $function$;
