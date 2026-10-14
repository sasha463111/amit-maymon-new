# Deploy, אתר הדגמה, משתמשי בדיקה, QA architecture

> הועבר מ-CLAUDE.md ב-2026-10-14 (העתק מדויק, ללא שינוי תוכן). נקרא לפי צורך — לא נטען אוטומטית בכל סשן.

## 17. גיט ו-Deploy

- **Repository:** GitHub (sasha463111/amit-maymon-new)
- **Branch:** `main` — זו הסביבה החיה, אין staging. פוש ל-`main` = דיפלוי לפרודקשן.
- **Deploy:** Vercel **native Git integration** — כל פוש ל-`main` מדפלייר אוטומטית שני פרויקטי Vercel
- **GitHub Actions שכן קיים:** `.github/workflows/enter-work-reminders.yml` — מפינג את ה-cron route כל 30 דקות
- **מיגרציות DB הן שלב נפרד** — פוש קוד לא מריץ SQL. מריצים דרך `supabase db push` או ידנית
- **Vercel Region:** `iad1` (הועבר מ-fra1, אל תחזיר)

### אתר הדגמה (2026-10-12)
- **אותו קוד**, פרויקט Vercel נפרד (שם מתוכנן `garage-demo` — לא להתחיל ב-`amit-maymon-new`, ה-middleware מפנה כתובות כאלה לאתר האמיתי) על פרויקט Supabase נפרד **garage-demo** (`xzeyxoagzeddadalfkym`) עם נתונים בדויים בלבד.
- המתג: `NEXT_PUBLIC_DEMO_MODE=true` — רק בפרויקט ההדגמה. בפרודקשן לא מוגדר ⇒ הכול זהה לאתר האמיתי. כל ההבדלים מרוכזים ב-`src/lib/demo.ts`: `BRAND_NAME` ("מוסך הדגמה" / "תהילה"), `CEO_NAME` ("רונן" / "עמית"), `CLOSURE_CLERK_NAME` ("אורית" / "אילנה"), `STAFF_EMAIL_DOMAIN`, `DEMO_LOGIN_EMAIL`; פס "גרסת הדגמה" (`src/components/DemoBanner.tsx`); הלוגו מוצג כטקסט בלבד.
- **כלל:** שם של עובד/לקוח אמיתי לא נכתב קבוע בקוד שמוצג למשתמש — רק דרך `src/lib/demo.ts`.
- **כל מיגרציה שרצה בפרודקשן מורצת גם על garage-demo** (חוץ מ-pg_cron של התזכורות — ההדגמה לא צריכה תזכורות, וה-job מפנה לכתובת האמיתית).
- לא לבלבל עם `NEXT_PUBLIC_PREVIEW_MODE` (נתוני מוק בזיכרון, בלי DB).

## 18. משתמשי בדיקה

התחברות היא **email בלבד, בלי סיסמה** — `signInWithPassword` עם סוד משותף (`EMAIL_ONLY_LOGIN_PASSWORD` ב-`.env.local`).

חשבונות בדיקה אמיתיים (אחד לכל role) מתועדים כ-`QA_ACCOUNT_*` בהערה ב-`.env.local` — **לא מועתקים לכאן בכוונה**. לבדיקה חיה — לפתוח את `.env.local` מקומית.

---

## 19. QA Testing Architecture (2026-09-01) ✅

**Status:** ✅ FULLY AUTONOMOUS — No approval gates needed

Master Tester Agent + 5 specialized role agents:
- `qa-office-tester.md` — OFFICE staff multi-branch
- `qa-service-manager-tester.md` — SERVICE_MANAGER single-branch
- `qa-ceo-tester.md` — CEO full-access
- `qa-painter-tester.md` — PAINTER limited-access
- `qa-service-advisor-tester.md` — SERVICE_ADVISOR read-only

**How to Run (Fully Autonomous)**
```bash
Agent(qa-master-tester)
# Spawns 5 agents, tests independently, generates FINAL MASTER QA REPORT
```

---
## כללי עבודה, Backup, Supabase CLI — הטקסט המקורי (§20–22)
## 20. כללי עבודה עם הפרויקט

1. **UI/UX חדש** → תמיד להשתמש ב-Stitch MCP לפני כתיבת קומפוננטים
2. **שינויי DB** → `supabase migration new <name>` → SQL עם `DROP ... IF EXISTS` → בדיקה מקומית (`supabase db reset`) → הרצה לפרוד (`supabase db push` או SQL Editor + `migration repair --status applied`)
3. **RLS** → כל שינוי schema חייב לעדכן policies בהתאם
4. **types/database.ts** → לעדכן ראשון בכל שינוי schema
5. **Server Actions** → `'use server'` בראש, תמיד לאמת role לפני פעולה
6. **Soft delete** → תמיד לסנן `.is('deleted_at', null)` בכל שאילתת SELECT על cases
7. **הוספת עמוד** → לעדכן navigation ב-`layout.tsx` לפי role
8. **התראות שמצביעות על משהו ספציפי** → להשתמש בדפוס `?highlight=<id>` הקיים
9. **לפני פוש לפרודקשן** → `npx tsc --noEmit` + `npm run build` + בדיקה חיה
10. **העלאת קובץ דרך Server Action** → תמיד `await shrinkImage(file)` (`src/lib/shrinkImage.ts`) לפני `formData.append`. בקשה לשרת מוגבלת ל-4.5MB ב-Vercel; תמונת מצלמה גדולה יותר פשוט נדחתה (נסיה, 2026-10-11: "מצלמים וקובץ לא עולה" — מתוך 152 מסמכים אף אחד לא מעל 4.45MB). כמה תמונות בבקשה אחת → `{ maxSide: 1600 }`


---


## 21. Backup & Safety

### 🚨 **BACKUP BEFORE EVERY PUSH**

**10. סטנדינג ריל: Backup לפני כל Push לפרודקשן** ⚠️
- **לפני כל `git push origin main`** חייב להוצא backup של מסד הנתונים!
- **רוץ:** `.\SqlBackup\backup-before-push.ps1`
- ה-script ירוץ backup אוטומטי, יבדוק שהצליח, ויבקש אישור לפני push
- **אם backup נכשל:** אל תדחוף! תקן את הבעיה קודם
- Backups נשמרים ב-`C:\GitHub\amit-maymon-new\SqlBackup`
- **Auto-cleanup:** backups ישנים מ-30 ימים יוחקו אוטומטית

### Daily Automatic Backups
- GitHub Actions workflow — runs daily at 2 AM UTC
- Backup artifacts stored for 30 days
- Manual trigger available via GitHub UI

### Migration Best Practices
- **תמיד** ליצור column חדשה **לפני** הורדת הישנה
- **תמיד** לעשות BACKFILL של נתונים קודם
- **תמיד** לבדוק אם יש data loss אחרי migration


---


## 22. Supabase CLI + Local Dev (הוקם 2026-09-01)

**סטטוס:** מותקן, מקושר לפרוד, ו-local stack מאומת עובד.

### הקמה
- `supabase` הוא devDependency. מפעילים `npx supabase <cmd>` מ-`C:\GitHub\amit-maymon-new`
- דרישות מקדימות: Docker Desktop (WSL2 backend) חייב לרוץ
- מקושר לפרוד: `supabase link --project-ref yhanmyvolpeiuxspcxmk`
- `config.toml`: `major_version = 17` (תואם לפרוד)

### Workflow למיגרציה חדשה
```
npx supabase migration new <name>
# כותבים SQL: DROP ... IF EXISTS לפני CREATE
npx supabase db reset                # בדיקה מקומית
# ... בודקים ...
# backup לפרוד
npx supabase db push                 # הרצה לפרוד
```

### פקודות שימושיות
- `npx supabase status` — URLs + keys של הסטאק המקומי
- `npx supabase stop` — עוצר (שומר נתונים)
- `npx supabase db diff -f <name>` — מייצר מיגרציה מהפרש סכמה
- `npx supabase gen types typescript --linked > src/types/database.gen.ts` — types מהפרוד
- `npx supabase db dump --linked -f <file>` — גיבוי


