# CLAUDE.md — Tehila Bodyshop CRM

מערכת ניהול תיקים למוסך פחחות תהילה (Next.js 14 + Supabase + Vercel). לקוח: עמית מיימון (CEO). פרוד חי, אין staging.

> **מבנה התיעוד (2026-10-14):** הקובץ הזה מכיל רק מה שנדרש בכל סשן. פירוט (סכמת DB, Server Actions, התראות/cron, מודולים, היסטוריה, הנוסח המלא של חוקי QA/הרשאות) נמצא ב-`docs/reference/` ונקרא לפי צורך — ראו "מפת הפירוט" בסוף.

## 1. מהו הפרויקט?

**Tehila Bodyshop CRM** — מערכת ניהול תיקים למוסך פחחות תהילה.
מנהלת את כל תהליך תיקון רכב מהגעתו הפיזית למוסך ועד סגירת התיק האדמיניסטרטיבית,
כולל שלב טרום-תיק (הפניות מחברות ביטוח שעדיין לא נקלטו).

**עיקרון מרכזי:** המערכת מונעת על-ידי צ'קליסט. המשתמש לא משנה סטטוס ידנית — רק "סמן בוצע" מקדם שלב.

**לקוח:** עמית מיימון (CEO), מוסך פחחות תהילה, שני סניפים: נתיבות ואשקלון.

---

## 2. Stack טכנולוגי

| טכנולוגיה | גרסה | תפקיד |
|-----------|------|--------|
| **Next.js** | 14.2.18 (App Router) | Framework ראשי, SSR + Server Actions |
| **TypeScript** | 5.x | שפת הפיתוח |
| **Supabase** | @supabase/ssr | DB (Postgres), Auth, Storage, Realtime |
| **TailwindCSS** | 3.x | Styling |
| **web-push** | — | Push notifications (VAPID) |
| **next-pwa** | — | PWA support |
| **Vercel** | — | Hosting, region: `iad1` |

**Supabase Project URL:** `https://yhanmyvolpeiuxspcxmk.supabase.co`



## 3. מפת פרויקט

```
src/app/(dashboard)/   דפים מוגנים (cases, approvals, closure, referrals, painters, returns, finance, collections, receivables, loaners, messages, settings, go/[id])
src/app/actions/       Server Actions (workflow.ts = הלב; push.ts; referrals.ts; settings.ts ...)
src/app/api/           cron/enter-work-reminders, push/dispatch, perf, customer-docs, health/db
src/lib/               permissions.ts, staffJobs.ts, notificationKinds.ts, pushSend.ts, mailer.ts, demo.ts, supabase/{client,server}.ts
src/middleware.ts      רענון סשן + הפניות דומיין (middleware.ts בשורש לא רץ!)
src/types/database.ts  כל ה-types — לעדכן ראשון בכל שינוי schema
supabase/migrations/   מיגרציות CLI (baseline 20260901180001); src/db/migrations/001–046 = היסטוריה קפואה
```

## 4. תפקידים

| Role | גישה | עיקר |
|---|---|---|
| `CEO` (עמית) | כל הסניפים (`branch_ids=[]`) | אישורים, הגדרות, מחיקת תיקים; לא מוגבל בשום הרשאה |
| `SERVICE_MANAGER` (ערן) | סניף שלו | workflow מקצועי, בקשות פחח |
| `SERVICE_ADVISOR` | סניף, או הכל אם `sees_all_branches` | עורכת שלבי workflow; **פרטי תיק לקריאה בלבד** (נאכף ב-`canEdit` + RLS) |
| `OFFICE` | 1+ סניפים (`branch_ids[]`) | `office_function`: REFERRALS (הפניות) / CLOSURE (סגירה); בפרטי תיק רק "הערות" ניתן לעריכה |
| `PAINTER` | סניף שלו | צ'קליסט פחח, בקשות |
| `WAREHOUSE` / `WAREHOUSE_MANAGER` | — | החזרת חלקים |
| `ACCOUNTANT` / `COLLECTIONS` | ACCOUNTANT שני סניפים; COLLECTIONS **בלי סניפים** | כספים/גבייה — לא רואות תיקים |

"משרה" = role + `office_function` (`src/lib/staffJobs.ts`) — היא שקובעת אילו התראות מגיעות. יועץ פחח = `is_bodywork_advisor`. פירוט עמודים לפי תפקיד: `docs/reference/modules-and-gotchas.md`.

## 5. סניפים

- **NETIVOT** (נתיבות)
- **ASHKELON** (אשקלון)

RLS מבטיח שמשתמשים רואים רק את סניפם. CEO רואה הכל, וכך גם `SERVICE_ADVISOR` עם `sees_all_branches=true`.


## 6. Workflow מקצועי (13 שלבים)

| # | step_key | שם עברי | הערות |
|---|----------|---------|-------|
| 0 | `OPEN_CASE` | פתיחת תיק | אוטומטי DONE בפתיחה |
| 1 | `FIXCAR_PHOTOS` | צילום FixCar | **חובה:** fixcar_link |
| 2 | `WHEELS_CHECK` | טפסי גלגלים | SKIPPED אוטומטית אם גיל רכב ≤ 2 שנים. **(2026-10-12)** אפשרות שלישית "🚫 ללא חלקים — אין צורך בטפסי גלגלים": משלים בלי קישור/קובץ ומסמן `ללא טפסי גלגלים` ב-`enter_work_checklist_state` |
| 3 | `PREP_ESTIMATE` | אומדן | אופציה להעלות קובץ אומדן. **אחרי השלמה:** כפתור "החלף / הוסף קובץ אומדן" (מי שיכול לערוך workflow) — מעלה כ-ESTIMATE ומציע למחוק את הקודם, בלי להחזיר את ה-workflow אחורה. "החזר לאומדן" (מחזיר את ה-workflow) מוצג ל-SERVICE_MANAGER/CEO בלבד, כמו בשרת |
| 4 | `SEND_TO_APPRAISER` | שליחה לשמאי | — |
| 5 | `WAIT_APPRAISER_APPROVAL` | המתנה לאישור שמאי | `requires_ceo_approval = true` |
| 6 | `ENTER_WORK` | כניסה לעבודה | אזהרה אם `parts_status ≠ AVAILABLE` — **אלא אם סומן "תיקון ללא חלקים"** (2026-10-12). בסטטוס חלקים ובצ'קליסט גלגלים נוספה תיבה "תיקון ללא חלקים" (נשמר ב-`enter_work_checklist_state`, מפתחות `NO_PARTS_REPAIR` / `NO_PARTS_WHEELS` ב-`WorkflowStepsSection.tsx`) |
| 7 | `ISSUE_CATALOG_NUMBERS` | ניפוק מק"טים | — |
| 8 | `PARTS_DISCOUNTS` | הנחות חלקים ועבודות | — |
| 9 | `QUALITY_CONTROL` | בקרת איכות | popup לבחירת יועץ |
| 10 | `WASH` | שטיפה | התראה ליועצי פחח בסיום |
| 11 | `SEND_COMPLETION_PHOTOS` | שליחת תמונות לשמאי גמר | — |
| 12 | `READY_FOR_OFFICE` | מוכן למשרד | התראה ל-OFFICE + פתיחת closure workflow אוטומטית |


**כללי workflow שנפתרו בדם (פירוט: `docs/reference/modules-and-gotchas.md`):**
- שורה **אחת** ב-`ceo_approvals` לכל (תיק, סוג) — `uniq_ceo_approvals_case_type`. לעולם לא להכניס שורה שנייה; `requestCeoApproval()` מחזיר REJECTED ל-PENDING.
- אין שער אישור CEO בשלבי הסוף/סגירה (עמית, 2026-10-12). חסימה רק אם יש extras ב-IN_TREATMENT, וב-CLOSE_CASE גם עד שמוזנים נתוני כספים.
- "דלג" (`skipStep`, `SKIPPABLE_STEPS` חייב להתאים ל-`SKIPPABLE_STEP_KEYS` בקומפוננטה) — בלי תופעות לוואי של השלב.

## 7. Workflow סגירה (4 שלבים)

| # | step_key | שם עברי |
|---|----------|---------|
| 0 | `CLOSURE_VERIFY_DETAILS_DOCS` | אימות מסמכים ופרטים |
| 1 | `CLOSURE_PROFORMA_IF_NEEDED` | פרופורמה אם נדרש |
| 2 | `CLOSURE_PREPARE_CLOSING_FORMS` | הכנת טפסי סגירה |
| 3 | `CLOSE_CASE` | סגירה סופית |

**פותח אוטומטית** כשמשלימים `READY_FOR_OFFICE` ב-workflow המקצועי.


<important if="you are touching notifications, push, email, cron reminders, or the notification bell">

## התראות — כללי ברזל (Standing Rule #3 + #3b)

- **מי מקבל מה נקבע במקום אחד — ב-DB, לפי משרה:** `notification_kind(type,title)` + `notification_is_relevant(role, office_function, kind)`, נאכף ע"י `trg_0_relevant_notifications_only` (BEFORE INSERT — מה שלא רלוונטי **לא נוצר**). למנכ"ל יש שכבות: `ceo_notification_tier` = ACTION (פעמון+פוש) / INFO (פעמון בלבד) / DROP.
- **התראה חדשה:** `type` ייחודי (לא `OTHER`; kinds מזוהים גם לפי טקסט כותרת — שינוי כותרת יכול להעביר kind) + מיגרציה שמעדכנת `notification_kind` / `notification_is_relevant` / `ceo_notification_tier`. כותרת לא מוכרת נופלת ל-`CASE_FLOW`. לבדוק ששאר התפקידים **לא** מקבלים.
- **Push = שורה.** לעולם לא לשלוח פוש inline: מכניסים התראה, ו-`trg_dispatch_ceo_push` → `/api/push/dispatch` שולח. `sendPushToUser()` בלי `{direct:true}` הוא no-op. התראה למנכ"לים = INSERT **אחד** (ה-fan-out משכפל; לולאה יוצרת כפילויות).
- **פונקציות שליחה חיות ב-`src/lib/pushSend.ts` (לא `use server`).** כל export מקובץ `use server` הוא endpoint ציבורי — לעולם לא לייצא משם שליחה (תיקון אבטחה 13/10).
- **מיילים רק דרך `src/lib/mailer.ts`** (`sendMail`; Graph כשמוגדר, אחרת Resend). אין לקרוא ל-api.resend.com ישירות.
- כל URL קבוע (טריגר פוש, מיילים) — רק לכתובת הרשמית `amit-maymon-new-psi.vercel.app`.
- פירוט מלא: `docs/reference/automation-notifications.md`, `NOTIFICATIONS_ROUTING.md`.

</important>

<important if="you are writing a Server Action or any write the user is told succeeded">

- כל כתיבה שהמשתמש מקבל עליה "בוצע" חייבת לבדוק **error וגם מספר שורות** (`.select('id')` ו-0 שורות = כשל). דוגמה: `completeActiveStep`.
- `'use server'` בראש, תמיד לאמת role/הרשאה לפני פעולה. כל export מקובץ `use server` = endpoint ציבורי.
- שאילתות על `cases` — תמיד `.is('deleted_at', null)` (soft delete).
- העלאת קובץ דרך Server Action: `await shrinkImage(file)` (`src/lib/shrinkImage.ts`) לפני `formData.append` — Vercel מגביל בקשה ל-4.5MB; כמה תמונות → `{ maxSide: 1600 }`.

</important>

<important if="you are adding or changing UI text, labels, or a new screen">

- כל ערך מוצג **עם כותרת** (מק"ט: / כמות: ...), לעולם לא מספר חשוף, וכל נתון בשורה משלו מלמעלה למטה (עמית, 14/10). רכיבים: `Fields`/`Field` ב-`ReturnsClient.tsx`.
- UI חדש → Stitch MCP לפני כתיבת קומפוננטות. עמוד חדש → לעדכן navigation ב-`(dashboard)/layout.tsx` לפי role.
- שם של עובד/לקוח אמיתי לא נכתב קבוע בקוד שמוצג — רק דרך `src/lib/demo.ts`.
- התראה שמצביעה על פריט → דפוס `?highlight=<id>`. אין רענון פרטי בעמוד (`<AutoRefresh />` גלובלי, 30 שנ׳).

</important>

<important if="you are changing the database: schema, migrations, RLS policies, or storage policies">

## DB — כללים (סכמה מלאה: `docs/reference/db-schema.md`; RLS: `docs/reference/rls-code-patterns.md`)

1. `npx supabase migration new <name>` → SQL עם `DROP ... IF EXISTS` לפני `CREATE` → בדיקה מקומית (`npx supabase db reset`, דורש Docker) → **גיבוי לפרוד** → `npx supabase db push` (גיבוי: SQL Editor + `migration repair --status applied`).
1א. **ההיסטוריה חייבת להתאים לקבצים** (תוקן 15/10 — 63 קבצים / 54 רשומות לא תאמו): מיגרציה שהורצה **לא** ב-`db push` (MCP `apply_migration` רושם חותמת זמן משלו, `db query`, SQL Editor) → מיד אחר כך `npx supabase migration repair --linked --status applied <מספר-הקובץ>`, ואם נוצרה רשומה יתומה — `--status reverted <החותמת>`. בדיקה: `npx supabase migration list --linked` בלי שורות לא תואמות, ו-`npx supabase db push --linked --dry-run` = "up to date". **מספר קובץ ייחודי** — לבדוק `ls supabase/migrations` לפני שבוחרים (שני סשנים בחרו 20261015210000).
2. כל שינוי schema → לעדכן `src/types/database.ts` ראשון, ולבדוק policies. עמודה חדשה **לפני** הורדת הישנה, BACKFILL לפני כן, ולבדוק data loss אחריו.
3. RLS: `branch_id = ANY(get_my_branch_ids())` (לא `get_my_branch_id`). הרשאות — Standing Rule #5.
4. כל מיגרציה שרצה בפרוד מורצת גם על garage-demo (`xzeyxoagzeddadalfkym`), חוץ מ-pg_cron של התזכורות.
5. מיגרציית cron/trigger עם URL — כתובת רשמית בלבד. תקלה בטריגר לעולם לא חוסמת שמירה (`EXCEPTION WHEN OTHERS` → WARNING).
6. `supabase` = devDependency, מריצים `npx supabase <cmd>` מתיקיית הפרויקט; `config.toml` `major_version = 17`; types: `npx supabase gen types typescript --linked`.

</important>

<important if="you are pushing to production, deploying, or backing up">

## Deploy ו-Backup

- `main` = פרודקשן. **שני remotes:** `origin` (sasha463111, לא מדפלוי) ו-`tomer` (tdavidyan85, **Vercel מצפה לו**). פוש = `git push origin main && git push tomer main`; **אחריו** `./scripts/check-deploy-remote.sh`. "push הצליח" ≠ "עלה" — הוכחה = HEAD של `tomer` זהה למקומי או Ready ב-Vercel (Standing Rule #7).
- לפני פוש: `npx tsc --noEmit` + `npm run build` + בדיקה חיה. build עובר מקומית → דיפלוי אוטונומי, בלי אישור ידני (Rule #1).
- **בדיקות אוטומטיות (#42, 16/10):** `npm run build` מריץ קודם את `vitest run` (`tests/*.test.ts`: חוקי פתיחת תיק, תשלום תביעה, החזרת חלק, מסירת רכב חליפי, תאריכים/שעון ישראל, דף בית, סיסמאות). בדיקה שנכשלת עוצרת את ה-build ב-Vercel, כלומר העדכון לא עולה. `npm run test:db` מריץ את `tests/db/checks.sql` מול המסד המקושר בתוך טרנזקציה שמתבטלת: הגנות ה-DB (מסירה כפולה, החזרה לפני מסירה, סגירת טיקט בלי "מה בוצע") ובדיקות אבטחה (RLS בכל טבלה, אין SECURITY DEFINER פתוח ל-anon, פונקציות רגישות סגורות, אין policy עם `true`, buckets פרטיים). להריץ לפני כל פוש שנוגע ב-DB. שינוי בחוק עסקי → לעדכן או להוסיף בדיקה באותו פוש.
- **גיבוי DB לפני כל פוש:** `.\SqlBackup\backup-before-push.ps1`; נכשל — לא דוחפים. (גיבוי יומי אוטומטי ב-GitHub Actions 02:00 UTC.)
- מיגרציות DB הן שלב נפרד — פוש קוד לא מריץ SQL.
- Vercel region **`bom1`** ליד Supabase (`ap-south-1`) — לא להחזיר ל-iad1. בדיקה: `GET /api/health/db`.
- כתובת אחת: `amit-maymon-new-psi.vercel.app`; ה-middleware בפרויקטים האחרים מפנה אליה. אתר הדגמה: `NEXT_PUBLIC_DEMO_MODE=true` בלבד (פירוט: `docs/reference/deploy-demo-qa.md`).
- `profiles` לא מתעדכן ישירות מהמשתמש: אין הרשאת UPDATE מלבד `email_notifications`. כל שינוי הולך דרך server action עם service client אחרי בדיקת הרשאה. אסור להחזיר את ההרשאה, כי זו הסלמת הרשאות (role).
- התחברות = מייל + **סיסמה אישית** (מ-15/10). רק המנכ"ל מאפס (`resetUserPassword`). אסור לחזור לכניסה במייל בלבד. `EMAIL_ONLY_LOGIN_PASSWORD` נשאר רק לאתר הדמו. חשבונות בדיקה `QA_ACCOUNT_*` ב-`.env.local`.

</important>

## 25. Standing Rules — החלטות קבועות

### 🔴 #1 + #7 — דיפלוי אוטונומי, ל-remote שבאמת מדפלוי
ראו "Deploy ו-Backup" למעלה. ב-2026-09-25 נמצא שפרוד רץ 8 ימים על קוד ישן מול סכמה חדשה כי `git push` הלך ל-`origin` בלבד. תמיד לאמת. לא למחוק אף remote בלי לשאול את הבעלים.

### 🔴 #2 — סנכרון תיעוד בכל פוש לפרודקשן
כל פוש לפרודקשן **מעדכן את ה-.md הרלוונטיים באותו commit**: `CLAUDE.md` (רק אם משתנה חוק/מבנה/תהליך), `docs/reference/*` (סכמה, actions, התראות, מודולים — כאן נכנסים פיצ'רים חדשים), `.claude/agents/*`, `BUSINESS_PROCESS.md`. נדרש עבור: שינוי לוגיקה, מיגרציה, פיצ'ר חדש/מוסר, תיקון שמשנה התנהגות, ריפקטור ארכיטקטוני. לא נדרש: הערות, לינט, שינוי שמות פנימי. **פיצ'ר חדש לא נכתב ל-CLAUDE.md** — הוא נכנס ל-`docs/reference/modules-and-gotchas.md` (פסקה לכל מודול), ורק *חוק* חדש נכנס לכאן.

### 🔴 #3 — התראות
ראו בלוק "התראות — כללי ברזל" למעלה.

<important if="you are running QA, testing a change before deploy, or writing tests">

### 🔴 #4 — QA מלא: happy path **וגם** sad path
מבחן happy-path בלבד = כשל קריטי (14/9: 4 באגים עלו כי QA לא בדק דחייה). חובה לפני כל דיפלוי: (1) העלאת קבצים בכל זרימה (קובץ ב-bucket + רשומה ב-DB); (2) multi-branch (OFFICE/SM עם 2+ סניפים — כן בורר, עם 1 — לא); (3) sad path — כל תפקיד נחסם כראוי, לא רק "אין כפתור"; (4) RLS — מורשה עובר ולא-מורשה נחסם, שגיאה ברורה; (5) שמות עמודות תואמים (`branch_ids` לא `branch_id`); (6) איתור דפוס — באג בקובץ A → grep ב-B..Z. הרצה: `Agent(qa-master-tester)` (5 סוכני תפקיד); מריצים רק את התפקידים שהשינוי נוגע בהם, ריצה מלאה לפני release גדול. נוסח מלא: `docs/reference/rule-qa-full.md`, `QA-TEST-GAPS-2026-09-14.md`.

</important>

<important if="you are adding or changing who may do what: permissions, role checks, RLS policies, or storage policies">

### 🔴 #5 — הרשאות חיות במטריצה (`role_permissions`), לעולם לא בקוד
`role_permissions` = מקור האמת היחיד. לא לקודד רשימת תפקידים לפעולה מהעשר: `create_case`, `create_referral`, `complete_professional_step`, `complete_closure_step`, `decide_approvals`, `upload_documents`, `delete_documents`, `manage_extras_status`, `manage_settings`, `delete_cases`. בדיקה: `hasPermission(supabase,'action')` (`src/lib/permissions.ts`); ב-RLS: `has_permission('x') AND (get_my_role()='CEO' OR branch_id = ANY(get_my_branch_ids()))`.

**ארבע אינווריאנטות:** (1) CEO אף פעם לא חסום; (2) בידוד סניפים מקודד קשיח — המטריצה קובעת תפקידים, לא סניפים; (3) fail closed — שגיאה/צמד לא ידוע = חסום; (4) הרשאה ניתנת בכל מקום או בשום מקום: server action + RLS + טבלאות תלויות + storage helper + שער UI.

**פעולה חדשה:** 5 שורות ב-`role_permissions` (מיגרציה) → `PermissionAction` ב-`permissions.ts` → תווית ב-`settings/PermissionsTab.tsx` → שער בשרת → RLS → טבלאות תלויות → שער UI → `tsc`, `build`, ולשאול מחדש את ה-policies בפרוד.

**חריגים מכוונים:** ניהול משתמשים (`users.ts`) CEO בלבד; בקשות פחח (`painter.ts`); `_storage_user_can_see_case()` branch-only; מחיקת העלאה שלך תמיד מותרת. `manage_settings` = בפועל הרשאת אדמין. נוסח מלא: `docs/reference/rules-permissions-rls-full.md`.

### 🔴 #6 — מאמתים RLS בהתחזות, לא בהיסק
לעולם לא לטעון שזרימה מוגנת-RLS עובדת בלי להריץ אותה בזהות המשתמש (קריאה לפונקציית עזר כאדמין → `auth.uid()` NULL → מסקנה שגויה). בתוך טרנזקציה ו-**תמיד ROLLBACK** (זה רץ על פרוד):

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
-- מריצים את הפעולה האמיתית (INSERT/UPDATE), לא helper
ROLLBACK;
```

כללים: בודקים את הפעולה לא את ה-helper; כל שכבה (server action, `storage.objects`, טבלת metadata); לאשר ב-`auth.users` שהמשתמש קיים ו-`is_active` (קיימים כפולים ומושבתים); לבדוק גם sad path; ארבעה buckets (`referral-documents` לפי `referral_id`, השאר לפי `case_id`) — מטריצת ההעלאה המאומתת ב-`docs/reference/rules-permissions-rls-full.md`; להריץ מחדש אחרי כל שינוי storage policy / `_storage_*` / מטריצה.

</important>

## מפת הפירוט (`docs/reference/`) — לקרוא לפי צורך

| קובץ | מתי |
|---|---|
| `db-schema.md` | טבלאות, עמודות, buckets |
| `server-actions.md` | מפת ה-Server Actions |
| `automation-notifications.md` | טריגרים, פוש, מייל, cron (8 סבבים), ניתוב התראות |
| `rls-code-patterns.md` | RLS helpers, Server→Client pattern, נתיבי קבצים קריטיים |
| `migrations-history.md` | היסטוריית 001–046 |
| `deploy-demo-qa.md` | אתר הדגמה, חשבונות בדיקה, ארכיטקטורת QA |
| `modules-and-gotchas.md` | **כל המודולים והפיצ'רים** (החזרות, כספים, גבייה, רכב חליפי, קישור ללקוח...) + חוקי workflow מלאים + עמודים לפי תפקיד |
| `history-sep-2026.md` | באגים קריטיים 3–4.9 (היסטוריה) |
| `rule-qa-full.md`, `rules-permissions-rls-full.md` | הנוסח המלא של Rules #4–#6 |

**הערת אמינות:** בקבצי reference יש חלקים שנכתבו בסשנים שונים ויכולים להיות מיושנים (למשל רשימת עמודים לפי תפקיד). הקוד ו-`supabase/migrations` גוברים תמיד.
