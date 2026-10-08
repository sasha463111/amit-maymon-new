-- התראה נסגרת לבד כשהמשימה שמאחוריה בוצעה (08.10.2026).
-- עמית: "כל עוד אני לא לוחץ 'סמן כנקרא' ההתראה נשארת בפעמון, גם אם ביצעתי את המשימה".

-- 1. התראה על פעולה שעשית בעצמך נוצרת כבר "נקראה".
CREATE OR REPLACE FUNCTION public.mark_own_action_read()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.triggered_by IS NOT NULL AND NEW.triggered_by = NEW.user_id THEN
    NEW.read := true;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_mark_own_action_read ON public.notifications;
CREATE TRIGGER trg_mark_own_action_read
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.mark_own_action_read();

-- ...ולכן גם לא שולחת פוש ומייל: אין סיבה להתריע לאדם על מה שהוא עצמו עשה.
CREATE OR REPLACE FUNCTION public.dispatch_ceo_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_secret text;
BEGIN
  IF NEW.read THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.user_id AND p.role = 'CEO' AND p.is_active) THEN
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
  RAISE WARNING 'dispatch_ceo_push failed for notification %: %', NEW.id, SQLERRM;
  RETURN NEW;
END $$;

-- 2. אישור הוכרע → "ממתין לאישור" נסגר; אישור אושר → "נדחה" הקודם נסגר.
CREATE OR REPLACE FUNCTION public.close_notifications_on_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status::text <> 'PENDING' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NOT EXISTS (SELECT 1 FROM public.ceo_approvals a
                   WHERE a.case_id = NEW.case_id AND a.status::text = 'PENDING' AND a.id <> NEW.id) THEN
      UPDATE public.notifications SET read = true
      WHERE case_id = NEW.case_id AND type = 'PENDING_APPROVAL' AND NOT read;
    END IF;
  END IF;
  IF NEW.status::text = 'APPROVED' THEN
    UPDATE public.notifications SET read = true
    WHERE case_id = NEW.case_id AND type = 'CEO_REJECTED' AND NOT read;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_close_notifications_on_approval ON public.ceo_approvals;
CREATE TRIGGER trg_close_notifications_on_approval
  AFTER INSERT OR UPDATE OF status ON public.ceo_approvals
  FOR EACH ROW EXECUTE FUNCTION public.close_notifications_on_approval();

-- 3. כל בקשות הפחח בתיק טופלו → התראות "בקשת פחח" נסגרות.
CREATE OR REPLACE FUNCTION public.close_notifications_on_painter_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status::text <> 'PENDING' AND OLD.status IS DISTINCT FROM NEW.status
     AND NOT EXISTS (SELECT 1 FROM public.painter_requests r
                     WHERE r.case_id = NEW.case_id AND r.status::text = 'PENDING') THEN
    UPDATE public.notifications SET read = true
    WHERE case_id = NEW.case_id AND type = 'PAINTER_REQUEST' AND NOT read;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_close_notifications_on_painter_request ON public.painter_requests;
CREATE TRIGGER trg_close_notifications_on_painter_request
  AFTER UPDATE OF status ON public.painter_requests
  FOR EACH ROW EXECUTE FUNCTION public.close_notifications_on_painter_request();

-- 4. הפחח סימן "נכנס לעבודה" → התזכורות נסגרות. התיק נסגר → "מוכן לסגירה" נסגר.
CREATE OR REPLACE FUNCTION public.close_notifications_on_case_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.painter_entered_work_at IS NOT NULL AND OLD.painter_entered_work_at IS NULL THEN
    UPDATE public.notifications SET read = true
    WHERE case_id = NEW.id AND title = 'תזכורת — רכב ממתין לעבודה' AND NOT read;
  END IF;
  IF NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL THEN
    UPDATE public.notifications SET read = true
    WHERE case_id = NEW.id AND type = 'READY_FOR_OFFICE' AND NOT read;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_close_notifications_on_case_progress ON public.cases;
CREATE TRIGGER trg_close_notifications_on_case_progress
  AFTER UPDATE OF painter_entered_work_at, closed_at ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.close_notifications_on_case_progress();

-- 5. ניקוי חד-פעמי של מה שכבר לא עדכני, לפי אותם כללים.
UPDATE public.notifications SET read = true
WHERE NOT read AND triggered_by IS NOT NULL AND triggered_by = user_id;

UPDATE public.notifications n SET read = true
WHERE NOT n.read AND n.type = 'PENDING_APPROVAL'
  AND NOT EXISTS (SELECT 1 FROM public.ceo_approvals a WHERE a.case_id = n.case_id AND a.status::text = 'PENDING');

UPDATE public.notifications n SET read = true
WHERE NOT n.read AND n.type = 'CEO_REJECTED'
  AND EXISTS (SELECT 1 FROM public.ceo_approvals a WHERE a.case_id = n.case_id AND a.status::text = 'APPROVED' AND a.decided_at > n.created_at);

UPDATE public.notifications n SET read = true
WHERE NOT n.read AND n.type = 'PAINTER_REQUEST'
  AND NOT EXISTS (SELECT 1 FROM public.painter_requests r WHERE r.case_id = n.case_id AND r.status::text = 'PENDING');

UPDATE public.notifications n SET read = true
FROM public.cases c
WHERE c.id = n.case_id AND NOT n.read
  AND ((n.title = 'תזכורת — רכב ממתין לעבודה' AND c.painter_entered_work_at IS NOT NULL)
    OR (n.type = 'READY_FOR_OFFICE' AND c.closed_at IS NOT NULL));
