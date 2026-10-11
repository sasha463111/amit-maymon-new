-- Notifications by role (Amit's spec, 2026-10-11). Every person receives only
-- what belongs to their job; what isn't theirs is not created at all.
-- Idempotent — safe to run again.
--
-- 1. Office split into two jobs: profiles.office_function
--      REFERRALS = "משרד הפניות" (avia, ilanit)   CLOSURE = "משרד סגירה" (אילנה)
--    NULL on an OFFICE user = both (old behaviour).
-- 2. ONE relevance rule (notification_is_relevant) applied by a BEFORE INSERT
--    trigger to every notification from every source (app code, cron, the
--    CEO fan-out): a row not relevant to its recipient is dropped.
-- 3. Push for everyone goes through the DB dispatcher (was CEO only), so a
--    push is sent exactly when a notification row exists — never for a
--    dropped one. The app code stops pushing on its own (same deploy).
-- 4. Existing unread notifications that are no longer relevant are marked read.

-- ---- 1. office function -------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS office_function text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_office_function_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_office_function_check
  CHECK (office_function IS NULL OR office_function IN ('REFERRALS', 'CLOSURE'));

UPDATE public.profiles p SET office_function = 'REFERRALS'
  FROM auth.users u WHERE u.id = p.id AND p.role = 'OFFICE'
  AND lower(u.email) IN ('avia@toyota-tehila.co.il', 'ilanit@toyota-tehila.co.il');
UPDATE public.profiles p SET office_function = 'CLOSURE'
  FROM auth.users u WHERE u.id = p.id AND p.role = 'OFFICE'
  AND lower(u.email) = 'reception@toyota-tehila.co.il';

-- ---- 2. the rule -------------------------------------------------------------
-- Kind of a notification, from its type (or title, for the many rows that
-- are stored as type OTHER).
CREATE OR REPLACE FUNCTION public.notification_kind(p_type text, p_title text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_type = 'DIRECT_NOTE'                          THEN 'NOTE'
    WHEN p_title LIKE 'תזכורת — רכב ממתין לעבודה%'       THEN 'PAINTER_REMINDER'
    WHEN p_type = 'PAINTER_REQUEST'                      THEN 'PAINTER_REQUEST'
    WHEN p_title LIKE 'הבקשה שלך%'                       THEN 'PAINTER_ANSWER'
    WHEN p_title LIKE 'רכב נכנס לעבודה%'                 THEN 'ENTER_WORK'
    WHEN p_title LIKE 'חלקים הגיעו%'                     THEN 'PARTS_ARRIVED'
    WHEN p_type = 'READY_FOR_OFFICE'                     THEN 'CLOSURE'
    WHEN p_title LIKE '%הפני%'                           THEN 'REFERRAL'
    WHEN p_title LIKE 'תיק חדש נפתח%'                    THEN 'NEW_CASE'
    ELSE 'CASE_FLOW' -- approvals, rejections, blocked, wash, wheels, extras, closed
  END
$$;

-- Who gets which kind. CEO: everything.
CREATE OR REPLACE FUNCTION public.notification_is_relevant(p_role text, p_office_function text, p_kind text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_role = 'CEO' THEN true
    WHEN p_kind = 'NOTE' THEN true -- personal notes / questions: always
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

CREATE OR REPLACE FUNCTION public.drop_irrelevant_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_role text;
  v_office text;
BEGIN
  SELECT role::text, office_function INTO v_role, v_office FROM public.profiles WHERE id = NEW.user_id;
  IF v_role IS NULL THEN RETURN NEW; END IF; -- unknown recipient: don't guess
  IF public.notification_is_relevant(v_role, v_office, public.notification_kind(NEW.type, NEW.title)) THEN
    RETURN NEW;
  END IF;
  RETURN NULL; -- not this person's job: not created
END $$;

-- "trg_0_…": BEFORE triggers run in name order — filter before the others.
DROP TRIGGER IF EXISTS trg_0_relevant_notifications_only ON public.notifications;
CREATE TRIGGER trg_0_relevant_notifications_only
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.drop_irrelevant_notification();

-- ---- 3. push for everyone through the dispatcher -----------------------------
CREATE OR REPLACE FUNCTION public.dispatch_ceo_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_secret text;
BEGIN
  IF NEW.read THEN RETURN NEW; END IF;
  -- Any active user with a registered device (was: CEO only).
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.user_id AND p.is_active) THEN
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

-- ---- 4. clean what is already there -----------------------------------------
UPDATE public.notifications n SET read = true
FROM public.profiles p
WHERE p.id = n.user_id AND NOT n.read
  AND NOT public.notification_is_relevant(p.role::text, p.office_function, public.notification_kind(n.type, n.title));
