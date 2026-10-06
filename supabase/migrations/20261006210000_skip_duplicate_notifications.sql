-- רשת ביטחון: התראה זהה לאותו אדם תוך 60 שניות לא נשמרת שוב (06.10.2026).
-- עמית ביקש "התראה אחת, לא כפולה". הכפילויות שנמצאו (אישור אומדן, טפסי גלגלים)
-- תוקנו בקוד, אבל זה מבטיח שגם מקור אחר — קיים או עתידי — לא ייצור כפילות.
-- חשוב במיוחד עכשיו: כל התראה יוצאת גם כפוש וגם כמייל, אז כפילות = שני מיילים.
--
-- "זהה" = אותו נמען, אותו תיק, אותו סוג, אותה כותרת ואותו תוכן.
-- התראה שנדחתה כאן לא מפעילה גם את ההעתקה האוטומטית ואת הפוש/מייל.

CREATE OR REPLACE FUNCTION public.skip_duplicate_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- נעילה לכל נמען: שתי התראות זהות בו-זמנית לא יעברו שתיהן את הבדיקה.
  PERFORM pg_advisory_xact_lock(hashtext('notification-dedupe:' || NEW.user_id::text));

  IF EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = NEW.user_id
      AND n.case_id IS NOT DISTINCT FROM NEW.case_id
      AND n.type = NEW.type
      AND n.title = NEW.title
      AND n.body IS NOT DISTINCT FROM NEW.body
      AND n.created_at > now() - interval '60 seconds'
  ) THEN
    RETURN NULL;  -- כפילות: לא נשמרת
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.skip_duplicate_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_skip_duplicate_notification ON public.notifications;
CREATE TRIGGER trg_skip_duplicate_notification
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.skip_duplicate_notification();
