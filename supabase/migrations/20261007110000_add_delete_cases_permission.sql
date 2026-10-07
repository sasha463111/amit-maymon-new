-- הרשאת "מחיקת תיקים" במטריצת ההרשאות (07.10.2026).
-- ערן ונסיה ביקשו למחוק תיקים "באישור עמית": ההרשאה נוספת למסך ההרשאות
-- בהגדרות, כבויה לכל התפקידים מלבד המנכ"ל, ועמית מדליק אותה בעצמו.
-- המחיקה היא "רכה" — התיק עובר לארכיון ורק המנכ"ל יכול לשחזר אותו.
INSERT INTO public.role_permissions (role, action, enabled) VALUES
  ('CEO',             'delete_cases', true),
  ('SERVICE_MANAGER', 'delete_cases', false),
  ('SERVICE_ADVISOR', 'delete_cases', false),
  ('OFFICE',          'delete_cases', false),
  ('PAINTER',         'delete_cases', false)
ON CONFLICT (role, action) DO NOTHING;
