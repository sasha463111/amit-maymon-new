# פריסה ב-Vercel – מצב נוכחי (עודכן 27–28.08.2026)

## המצב בפועל

- **הריפו:** `https://github.com/sasha463111/amit-maymon-new`
- **הענף החי:** `main` (לא `master`) — כל push ל-`main` מפעיל דיפלוי אוטומטי, בלי GitHub Action (הוסר, היה מיותר וכשל תמיד עם טוקן ישן — ראה commit `1ac3d0b`).
- **שני פרויקטי Production נפרדים, אותו מסד נתונים Supabase:**
  - `amit-maymon-new` → `amit-maymon-new.vercel.app`
  - `amit-maymon-new-iyub` → `amit-maymon-new-iyub.vercel.app`
  - שניהם מחוברים ל-Git integration של אותו ריפו, ושניהם מתעדכנים אוטומטית מאותו push ל-`main`.

## חיבור פרויקט חדש (אם צריך מהתחלה)

1. **[vercel.com](https://vercel.com)** → התחבר עם GitHub.
2. **Add New…** → **Project** → **Import Git Repository** → `sasha463111/amit-maymon-new`.
3. Framework Preset: **Next.js** (מזוהה אוטומטית).

## משתני סביבה (Production) — הרשימה המלאה

ב-Settings → Environments → Production:

| Name | הערה |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | כתובת פרויקט Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | מפתח ציבורי |
| `SUPABASE_SERVICE_ROLE_KEY` | **סודי** — עוקף RLS, לעולם לא בצד לקוח |
| `EMAIL_ONLY_LOGIN_PASSWORD` | **סודי** — הסיסמה המשותפת מאחורי כניסה-באימייל-בלבד; חייב להיות זהה **בשני** הפרויקטים |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | מפתח ציבורי להתראות push |
| `VAPID_PRIVATE_KEY` | **סודי** — זוג עם המפתח הציבורי; לעולם לא לייצר זוג חדש (כל מכשיר רשום יפסיק לקבל התראות) |
| `VAPID_SUBJECT` | `mailto:...` |
| `CRON_SECRET` | **סודי** — מגן על `/api/cron/enter-work-reminders`; חייב להיות זהה למה שמוגדר כ-secret ב-GitHub Actions |
| `NEXT_PUBLIC_PREVIEW_MODE` | להשאיר כבוי ב-production (לא להגדיר, או `false`) |

**חשוב:** `EMAIL_ONLY_LOGIN_PASSWORD` ומפתחות VAPID חייבים להיות **זהים בשני הפרויקטים** — לא לייצר ערכים שונים לכל אחד.

## אחרי ה-Deploy

- Push ל-`main` = דיפלוי אוטומטי לשני הפרויקטים.
- בדוק ב-**Vercel Dashboard → Deployments** שהוא הסתיים ב-Ready (לא רק שה-push עבר).
- שינוי משתנה סביבה **לא** נכנס לתוקף אוטומטית — צריך **Redeploy** ידני אחרי כל שינוי כזה.

## מיגרציות DB — נפרד לגמרי מהדיפלוי

Push ל-`main` **לא** מריץ שום דבר במסד הנתונים. כל קובץ חדש תחת `src/db/migrations/` צריך להיות מורץ ידנית ב-Supabase Dashboard → SQL Editor, בנפרד מהדיפלוי של הקוד.
