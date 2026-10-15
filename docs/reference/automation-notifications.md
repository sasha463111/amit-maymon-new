# Automation, התראות, cron, פוש

> הועבר מ-CLAUDE.md ב-2026-10-14 (העתק מדויק, ללא שינוי תוכן). נקרא לפי צורך — לא נטען אוטומטית בכל סשן.

## 12. לוגיקת אירועים אוטומטיים (Automation)

| טריגר | מה קורה |
|-------|---------|
| שלב `READY_FOR_OFFICE` הושלם | 1. התראה לכל OFFICE בסניף 2. יוצר CLOSURE workflow run עם 4 שלבים |
| שלב `WASH` הושלם | התראה לכל `is_bodywork_advisor = true` בסניף |
| שלב `WAIT_APPRAISER_APPROVAL` הושלם | יוצר `ESTIMATE_AND_DETAILS` approval אם לא קיים |
| בקשת פחח נשלחת | התראה לכל `is_bodywork_advisor = true` בסניף |
| מנהל שירות/CEO עונה לבקשת פחח | התראה חזרה לפחח שפתח את הבקשה |
| `SEND_COMPLETION_PHOTOS`/`READY_FOR_OFFICE` בלי אישור `ESTIMATE_AND_DETAILS` | חסימה + יצירת approval PENDING |
| WHEELS_CHECK הושלם | התראת FYI לעמית (CEO) בלבד |
| כל התראה נוצרת | fanout ל-CEO + יועצים חוצי-סניף |

### כתובת אחת: `amit-maymon-new-psi.vercel.app` (2026-10-07)
אותו קוד נפרס לשלושה פרויקטי Vercel. `amit-maymon-new.vercel.app` ו-`amit-maymon-new-iyub.vercel.app` (בחשבון של סשה) רצים עם מפתח service-role לא תקף ומפתח VAPID אחר — פוש מהם לא מגיע. `src/middleware.ts` מפנה (307) כל **עמוד** בהם לכתובת הרשמית; `/api/*` וקבצים לא מופנים.

**שורש "מבקש מייל בכל פתיחה" (2026-10-10):** האפליקציה המותקנת נפתחת ב-`/` (`start_url`), ו-`/` תמיד שלח ל-`/login` בלי לבדוק סשן; גם דף הכניסה לא בדק. המשתמש נשאר מחובר בפועל (נראה ביומני Supabase: התחדשות מוצלחת ואז כניסה ידנית 16 שנ׳ אחריה) אבל ראה את טופס המייל. עכשיו `/` ו-`/login` שולחים משתמש מחובר ופעיל לדף הבית של התפקיד (`src/lib/roleHome.ts`, `src/lib/signedInHome.ts`); יציאה מכוונת עוברת ל-`/login?out=1` ואז אין הפניה חוזרת. הכלל משקף את `(dashboard)/layout.tsx` (חשבון מושבת = לא מחובר) כדי למנוע לולאה.

**חידוש ההתחברות (2026-10-09):** `src/middleware.ts` מרענן את הסשן בכל בקשת עמוד (`getUser()` + כתיבת עוגיות לשנה). בלעדיו טלפון שנפתח אחרי שעה+ נזרק להתחברות: Server Component מחדש את הטוקן אבל לא יכול לשמור עוגייה, וה-refresh token החד-פעמי כבר נוצל. תיבת "זכור אותי" הוסרה מעמוד הכניסה — היא כתבה עוגייה שאף אחד לא קרא.

⚠️ **`middleware.ts` שבשורש הפרויקט לא פעיל ומעולם לא רץ** (נמצא 2026-10-07): כש-app יושב תחת `src/app`, Next.js מריץ רק את `src/middleware.ts`. כולל העוגייה לשנה וההפניות שבו — אל תניחו שהם עובדים. הפעלה = העברה ל-`src/` + בדיקת התחברות/התנתקות. כל קישור/URL קבוע (טריגר הפוש, מיילים) — רק לכתובת הרשמית.

### פוש על כל התראה למנכ"ל — `trg_dispatch_ceo_push` (2026-10-06)
רוב ההתראות של המנכ"ל נוצרות בתוך ה-DB (fan-out, cron) ואפליקציה לא רואה אותן — לכן הפוש יוצא מה-DB:
- טריגר `AFTER INSERT` על `notifications`: לכל שורה של CEO פעיל → `pg_net` קורא ל-`POST /api/push/dispatch` עם `{id}`
- אימות: header `x-dispatch-secret` מול סוד ב-**Supabase Vault** (`push_dispatch_secret`), נבדק ב-`check_push_dispatch_secret()` (service_role בלבד). הסוד לא בקוד ולא ב-env
- `notifications.pushed_at` = סימון "נשלח" — ה-route תופס את השורה אטומית, אין כפילויות
- תקלה בטריגר **לעולם** לא חוסמת שמירת התראה (`EXCEPTION WHEN OTHERS` → WARNING)
- ה-URL קבוע בטריגר (`amit-maymon-new-psi.vercel.app`) — לעדכן אם הדומיין משתנה
- ביטול מיידי: `DROP TRIGGER trg_dispatch_ceo_push ON public.notifications;`
- בדיקת תקינות: `net._http_response` (סטטוס הקריאות) + `pushed_at` על התראות המנכ"ל
- הוחל ידנית ב-SQL Editor (לא דרך CLI) — הקובץ אידמפוטנטי, הרצה חוזרת בטוחה
- **התראות פתוחות בעמוד התיק (2026-10-07):** `CaseNotificationsPanel` מציג בראש התיק את ההתראות שלא נקראו של המשתמש הנוכחי על התיק, עם "✓ טופל" (= `markRead`, אישי לכל משתמש)
- **הערות אישיות (`DIRECT_NOTE`, 2026-10-07):** `CaseNotesComposer` (בעמוד הסגירה) + `src/app/actions/caseNotes.ts`. טקסט חופשי לנמענים שנבחרו — רק עובדים עם מייל `@toyota-tehila.co.il` (לא חשבונות בדיקה). ה-fan-out **מדלג** על הסוג הזה (מיגרציה `20261007115802`), כך שהערה מגיעה רק למי שנבחר. היסטוריית ההערות בתיק נקראת עם service client אחרי בדיקת גישה לתיק. **בכל תיק** (2026-10-08): גם בעמוד התיק ובעמוד הפחח, כפתור מקופל "💬 שליחת הערה / שאלה". **פרטיות:** כל משתמש רואה בהיסטוריה רק הערות ששלח או קיבל; המנכ"ל רואה הכל
- **רישומי פוש שנוצרו עם מפתח אחר** (403 BadJwtToken / "do not correspond") נמחקים אוטומטית בשליחה, כמו רישום שפג תוקפו
- **פוש למנכ"ל יוצא רק מכאן:** `sendPushToUser()` מדלג על כל נמען CEO אלא אם נקרא עם `{ direct: true }` (רק ה-dispatcher ובדיקת-הפוש העצמית). כך אף נתיב קוד לא יכול לשלוח למנכ"ל פוש כפול
- **התראה למנכ"לים = INSERT אחד** לאחד מהם; ה-fan-out מעתיק לשאר. לולאה שמכניסה שורה לכל CEO יוצרת כפילות (קרה: 34 זוגות בשבוע)
- **רשת ביטחון:** `trg_skip_duplicate_notification` (BEFORE INSERT) — התראה זהה (נמען+תיק+סוג+כותרת+תוכן) תוך 60 שניות לא נשמרת
- **פעמון בשתי לשוניות (2026-10-10, לפי תפקיד):** "לטיפולי" = מה שבאמת שלי, **לפי התפקיד** (`actionTypesForRole` ב-`src/lib/notificationKinds.ts`, בהתאם לטבלת הניתוב ב-`notifyRelevantParties`). מנכ"ל: אישור שממתין + הערה/שאלה אליו. מנהל שירות: דחייה, פעולה חסומה, בקשת פחח, תוספת, הערה. יועצת: בקשת פחח, דחייה, פעולה חסומה, הערה. משרד: תיק מוכן לסגירה, פעולה חסומה, הערה. פחח: בקשת פחח, הערה. אישור שממתין תמיד שם גם אחרי שנקרא. "עדכונים שוטפים" = כל השאר, כדי לעקוב אחרי מהלך העבודה ומי ביצע מה. "✓ סמן עדכונים כנקראו" (`markUpdatesRead`, לפי תפקיד המשתמש) לא נוגע ב"לטיפולי"
- **תיבת הודעות "הודעות" (`/messages`, 2026-10-10, בקשת עמית):** לכל משתמש, בתפריט עם מונה לא-נקראו (`badges` ב-`SidebarNav`, נספר ב-layout). "נכנסות" = כל ה-`DIRECT_NOTE` שנשלחו אליו מכל התיקים (שולח, תיק עם קישור, "↩️ השב" → חוזר לשולח על אותו תיק, "✓ קראתי"); "יוצאות" = מה ששלח + מי קרא. "+ הודעה חדשה" = הודעה כללית בלי תיק (`case_id` null, `action_url` `/messages`). הכל ב-`src/app/actions/caseNotes.ts` (`deliverNote` משותף להערה בתיק/הודעה כללית/תשובה, `getMyMessages`, `sendGeneralMessage`, `replyToMessage`). אותן שורות `DIRECT_NOTE` → פוש, "לטיפולי" בפעמון ומייל גיבוי לעמית עובדים כרגיל. ללא שינוי DB
- **(2026-10-09, תשובות עמית):** המייל הוא **גיבוי**: נשלח רק לסוגים `PENDING_APPROVAL`, `CEO_REJECTED`, `DIRECT_NOTE` (`EMAIL_TYPES` ב-`src/lib/notificationEmail.ts`) ו**רק אם ההתראה עדיין לא נקראה שעה אחרי שהגיעה** — סבב 5 ב-cron (`runBackupEmails`, כל 30 דק׳ → המייל יוצא 60–90 דק׳ אחרי). ה-dispatch route שולח פוש בלבד. עדכונים — רק פוש ובאפליקציה. תזכורת "רכב ממתין לעבודה" חדשה סוגרת את הקודמות של אותו רכב (cron). עדכונים רגילים נשארים פתוחים עד סימון (בחירת עמית)
- **מייל לכל התראה (2026-10-06):** אותו route שולח גם מייל דרך Resend (`src/lib/notificationEmail.ts`), **רק** למי שמסומן `profiles.email_notifications = true` (כרגע עמית בלבד — לא להפעיל לחשבונות בדיקה). מכסה: **50 ביום לפי שעון ישראל**, נאכפת ב-`claim_notification_email()` עם נעילה; המייל ה-50 כולל הודעה שהמכסה נוצלה. שליחה שנכשלה מחזירה את המקום (`release_notification_email`). `notifications.emailed_at` = סימון וספירה. המייל עם `<meta charset="utf-8">` מפורש — בלעדיו תוכנות דואר הציגו עברית משובשת

### תזכורות מתוזמנות — `/api/cron/enter-work-reminders` (038, 043)
Route יחיד עם שישה סבבים. **מופעל כל 30 דקות ע"י `pg_cron` ב-Supabase** (job `tehila-reminders`, מיגרציה `20261011220000`, עם הסוד `push_dispatch_secret` מה-Vault בכותרת `x-dispatch-secret`). עד 2026-10-11 הופעל ע"י GitHub Actions — שבפועל רץ רק 3–4 פעמים ביום (ה-workflow הישן עם `CRON_SECRET` **הוצא משימוש ב-15/10** מטעמי אבטחה — `CRON_SECRET` היה בריפו הציבורי. ה-route לא מקבל אותו יותר, וה-workflow `enter-work-reminders.yml` כבוי. הקריאה היחידה: pg_cron עם `x-dispatch-secret`). כל סבב אידמפוטנטי.

| # | מה בודק | תנאי | מגבלה |
|---|---------|------|--------|
| 1 | `ENTER_WORK` הושלם אך `painter_entered_work_at` ריק | **פעם ביום לכל רכב, בבוקר** (2026-10-11; קודם כל ~110 דק׳) | 09:00–12:00, א׳–ה׳, בלי חגים |
| 2 | בקשת פחח PENDING | אחרי שעה | חד-פעמי; לא יותר מ-48 שעות אחורה |
| 3 | תיק מוכן לסגירה, אף OFFICE לא פתח את ההתראה | אחרי שעה | חד-פעמי; לא יותר מ-48 שעות אחורה |
| 4 | הפניה עם `follow_up_date` שהגיע | ביום שנקבע | חד-פעמי, בלי הגבלת גיל |
| 5 | מייל גיבוי להתראה לטיפול שלא נקראה | שעה אחרי | עד 50 ביום |
| 6 | **דוח סוף יום** לעמית (`src/lib/dailyReport.ts`, 2026-10-10): הפניות שנפתחו לתיקים היום, הפניות פתוחות, תיקים פתוחים, תיקים שנסגרו היום — נתיבות/אשקלון/סה"כ | מ-18:00 (`DAILY_REPORT_HOUR`), א׳–ה׳ בלי חגים | פעם ביום: `Idempotency-Key` של Resend לפי תאריך (409 = כבר נשלח), בלי טבלה |
| 9 | **תזכורות גבייה** (`runCollectionReminders`, 2026-10-14): רישום בטיפול השוטף של תיק גבייה עם `remind_at` שהגיע → התראה `COLLECTION_REMINDER` ל-`remind_user` (פוש + פעמון), בלי fan-out | בכל שעה, כל יום | פעם אחת לכל תזכורת (`reminded_at` נתפס לפני השליחה) |
| 10 | **סיכום גבייה שבועי** (`runCollectionsWeekly`, 2026-10-14): `loadWeeklySummary` → התראה `COLLECTION_REMINDER` לכל CEO ו-ACCOUNTANT פעיל (פוש + פעמון), קישור ל-`/collections?tab=summary` | יום ראשון, מ-08:00 | פעם בשבוע (מפתח `collections-weekly/<date>` ב-`sent_emails`) |

---
## Standing Rule #3 המקורי (טבלת ניתוב, הוחלף ע"י #3b)
### 🔴 Standing Rule #3: Role-Based Notification Routing (2026-09-03)

**Policy:** All notifications in the system MUST use `notifyRelevantParties()` router instead of `pushToOverseers()` or direct fan-out.

**Core principle:** Each notification type maps to exactly one set of recipient roles, filtered by branch. No exceptions for "just this one" alert.

**Routing table (canonical source: `NOTIFICATIONS_ROUTING.md`):**

| Action Type | Primary Recipients | CEO Gets It? | Branch Filter |
|---|---|---|---|
| PENDING_APPROVAL | — | ✅ (audit) | All |
| NEW_CASE | SERVICE_MANAGER | ✅ | Same |
| ENTER_WORK | SERVICE_ADVISOR, PAINTER | ✅ | Same |
| WASH_COMPLETE | SERVICE_ADVISOR | ✅ | Same |
| READY_FOR_OFFICE | OFFICE | ✅ | Same |
| CASE_CLOSED | OFFICE, SERVICE_MANAGER | ✅ | Same |
| PAINTER_REQUEST | SERVICE_ADVISOR, PAINTER | ✅ | Same |
| PARTS_ARRIVED | PAINTER | ✅ | Same |
| APPROVAL_REJECTED | SERVICE_MANAGER | ✅ | Same |
| APPROVAL_APPROVED | SERVICE_MANAGER | ✅ | Same |
| EXTRA_CREATED | SERVICE_MANAGER | ✅ | Same |

**Adding a new notification type:**
1. Decide: What action triggers this? Who should see it?
2. Add entry to routing table in `NOTIFICATIONS_ROUTING.md`
3. Implement in `notifyRelevantParties()` function (`src/app/actions/push.ts`)
4. Update trigger code to call `notifyRelevantParties(actionType, branchId, ...)`
5. Test that wrong roles DON'T get it, right roles DO

**Why this exists:**
- **Before:** SERVICE_ADVISOR in Ashdod got notifications for Netivot cases (noise, irrelevant)
- **After:** Only Netivot SERVICE_ADVISOR + CEO see it (focused, relevant)

**Related files:**
- `src/app/actions/push.ts` — `notifyRelevantParties()` function
- `NOTIFICATIONS_ROUTING.md` — Complete routing architecture
- `NOTIFICATIONS_AUDIT_COMPLETE.md` — Full audit of all 16 notification types

