-- מייל על כל התראה למנכ"ל, עד 50 ביום (בקשת עמית, 06.10.2026).
-- המייל ה-50 של היום כולל הודעה שהמכסה נוצלה ולא יישלחו עוד מיילים עד מחר.
-- נשלח מאותו נתיב כמו הפוש: /api/push/dispatch, שמופעל מהטריגר trg_dispatch_ceo_push.

-- סימון שההתראה נשלחה במייל — גם מונע כפילות וגם משמש לספירת המכסה היומית.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
CREATE INDEX IF NOT EXISTS notifications_user_emailed_at_idx
  ON public.notifications (user_id, emailed_at) WHERE emailed_at IS NOT NULL;

-- מי מקבל מיילים. כבוי כברירת מחדל, כדי שחשבונות בדיקה לא יקבלו מיילים.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_notifications boolean NOT NULL DEFAULT false;
UPDATE public.profiles SET email_notifications = true
WHERE id = '97fe50b8-5148-42a4-914c-0cd0d5c8ae6a';  -- עמית מימון, amitm@toyota-tehila.co.il

-- תופס "מקום" במכסה היומית עבור התראה אחת.
-- מחזיר שורה (slot, email) אם מותר לשלוח: slot = מספר המייל היום (1..50).
-- לא מחזיר כלום אם: כבר נשלח, המשתמש לא מקבל מיילים, או שהמכסה מלאה.
CREATE OR REPLACE FUNCTION public.claim_notification_email(p_notification_id uuid, p_daily_limit int DEFAULT 50)
RETURNS TABLE (slot int, email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user uuid;
  v_email text;
  v_day_start timestamptz;
  v_count int;
BEGIN
  SELECT n.user_id INTO v_user
  FROM public.notifications n
  WHERE n.id = p_notification_id AND n.emailed_at IS NULL;
  IF v_user IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_user AND p.email_notifications AND p.is_active
  ) THEN RETURN; END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_user;
  IF v_email IS NULL OR v_email = '' THEN RETURN; END IF;

  -- נעילה לכל משתמש, כדי ששתי התראות בו-זמניות לא יתפסו שתיהן את המקום ה-50.
  PERFORM pg_advisory_xact_lock(hashtext('notification-email:' || v_user::text));

  -- "היום" לפי שעון ישראל.
  v_day_start := date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') AT TIME ZONE 'Asia/Jerusalem';
  SELECT count(*) INTO v_count
  FROM public.notifications n
  WHERE n.user_id = v_user AND n.emailed_at >= v_day_start;
  IF v_count >= p_daily_limit THEN RETURN; END IF;

  UPDATE public.notifications SET emailed_at = now()
  WHERE id = p_notification_id AND emailed_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;

  slot := v_count + 1;
  email := v_email;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_notification_email(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_email(uuid, int) TO service_role;

-- מחזיר את המקום למכסה אם שליחת המייל נכשלה.
CREATE OR REPLACE FUNCTION public.release_notification_email(p_notification_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  UPDATE public.notifications SET emailed_at = NULL WHERE id = p_notification_id;
$$;
REVOKE ALL ON FUNCTION public.release_notification_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_notification_email(uuid) TO service_role;
