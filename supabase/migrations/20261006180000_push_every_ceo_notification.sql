-- פוש על כל התראה שמגיעה למנכ"ל (בקשת עמית, 06.10.2026).
-- רוב ההתראות של המנכ"ל נוצרות בתוך בסיס הנתונים (העתקות אוטומטיות ותזכורות),
-- ולכן הפוש חייב לצאת מכאן: טריגר קורא ל-/api/push/dispatch עבור כל שורה חדשה.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- סימון שהתראה כבר נשלחה — כך היא לא תישלח פעמיים.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS pushed_at timestamptz;

-- סוד משותף בין הטריגר לשרת. נשמר רק בכספת של Supabase.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'push_dispatch_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'push_dispatch_secret',
      'Authenticates the notifications trigger to /api/push/dispatch'
    );
  END IF;
END $$;

-- מאפשר לשרת לאמת את הסוד בלי לקרוא אותו.
CREATE OR REPLACE FUNCTION public.check_push_dispatch_secret(p_secret text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(length(p_secret), 0) > 0 AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'push_dispatch_secret' AND decrypted_secret = p_secret
  );
$$;
REVOKE ALL ON FUNCTION public.check_push_dispatch_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_push_dispatch_secret(text) TO service_role;

CREATE OR REPLACE FUNCTION public.dispatch_ceo_push()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_secret text;
BEGIN
  -- רק מנכ"לים פעילים.
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.user_id AND p.role = 'CEO' AND p.is_active) THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'push_dispatch_secret' LIMIT 1;

  -- נשלח רק אחרי שהשמירה הסתיימה בהצלחה.
  PERFORM net.http_post(
    url := 'https://amit-maymon-new-psi.vercel.app/api/push/dispatch',
    body := jsonb_build_object('id', NEW.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', coalesce(v_secret, '')),
    timeout_milliseconds := 10000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- תקלה בפוש לעולם לא תמנע את שמירת ההתראה עצמה.
  RAISE WARNING 'dispatch_ceo_push failed for notification %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_ceo_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dispatch_ceo_push ON public.notifications;
CREATE TRIGGER trg_dispatch_ceo_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_ceo_push();
