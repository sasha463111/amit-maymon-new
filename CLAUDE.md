# CLAUDE.md — Tehila Bodyshop CRM
## כל מה ש-Claude Code צריך לדעת על הפרויקט

---

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

---

## 3. מבנה תיקיות

```
src/
  app/
    (dashboard)/          # כל הדפים המוגנים (אחרי login)
      layout.tsx          # Header + navigation per role
      cases/               # רשימת תיקים + יצירת תיק
      approvals/           # אישורי CEO
      closure/             # סגירת תיקים
      extras/              # תוספות פחחות
      referrals/           # הפניות טרום-תיק
      notifications/       # התראות
      painters/            # לוח פחח
      settings/            # הגדרות (CEO בלבד)
      go/[id]/             # ניתוב role-neutral להתראות
    actions/               # Server Actions
      workflow.ts          # יצירת תיק, השלמת שלב, מחיקה
      approvals.ts         # אישור/דחיית CEO
      caseDetails.ts       # עדכון פרטי תיק
      documents.ts         # העלאת/מחיקת מסמכים
      extras.ts            # ניהול תוספות
      notifications.ts     # התראות
      painter.ts           # צ'קליסט פחח + בקשות
      referrals.ts         # הפניות: CRUD, יומן מעקב, תזכורות
      settings.ts          # הגדרות הרשאות + workflow + יועצי פחח
      push.ts              # Web Push
      vehicleLookup.ts     # שליפת סוג/שנת רכב
      reports.ts           # דוח סיכום יומי
      auth.ts              # login/logout
    api/cron/
      enter-work-reminders/route.ts  # 4 סבבי תזכורות אוטומטיות
  lib/
    supabase/
      client.ts            # Browser client
      server.ts             # Server client (cookies)
    recipients.ts           # branchRecipients() helper
  types/
    database.ts             # כל ה-types, enums, interfaces
  db/
    migrations/             # SQL migrations 001–046 (היסטוריה קפואה)
supabase/
  config.toml              # הגדרות Supabase CLI
  migrations/              # מיגרציות CLI עם timestamp
  _archive/                # remote_history_pre_rebaseline
```

---

## 4. תפקידים (Roles)

| Role | שם | גישה | מה הם עושים |
|------|----|------|-------------|
| `SERVICE_MANAGER` | ערן | סניף שלו (array) | מנהל workflow מקצועי: FixCar, אומדן, שמאי, כניסה לעבודה, QC, שטיפה; עונה על בקשות פחח |
| `OFFICE` | אילנה, אביה | **1+ סניפים** (multi-branch) | סגירה אדמיניסטרטיבית: מסמכים, פרופורמה, טפסי סגירה; ניהול הפניות; עכשיו יכולות לעבוד עם 2+ סניפים עם טאבים. **בפרטי תיק: רק שדה "הערות" פתוח לעריכה** (2026-10-06), שאר הפרטים נעולים. **(2026-10-11)** לשונית "תיקים" בתפריט עם מסנן "תיקים שפתחתי" (פעיל כברירת מחדל); עריכת הערות/פרטים ומסמכים נרשמים בהיסטוריית התיק עם שם המבצע (`CASE_UPDATED`/`DOCUMENT_*` ב-`audit_events`) |
| `CEO` | עמית | **כל הסניפים** | אישורים + גישה לכל + מחיקת תיקים + הגדרות; מקבל **כל** התראה במערכת כולל פעולות שהוא עצמו ביצע |
| `PAINTER` | ארז | סניף שלו | צ'קליסט פחח (נכנס לעבודה, חלקים), בקשות תוספות, תוספות פחחות |
| `SERVICE_ADVISOR` | כנרת | סניף שלה, או כל הסניפים | יועצת פחח: מעריכה אך עורכת workflow steps (עלאות קבצים, התקדמות שלבים), אך לא פרטי תיק (read-only on case details) |

**CEO אינו מגביל branch** — `branch_ids = []` (ריק = כל הסניפים)
**OFFICE staff עכשיו multi-branch** — `branch_ids` array (מיגרציה 046)

**יועצי פחח** (`is_bodywork_advisor = true`): SERVICE_MANAGER + SERVICE_ADVISOR — מקבלים התראות על WASH ועל בקשות מהפחח.

**SERVICE_ADVISOR Permissions (2026-09-04 clarified):**
- ✅ Can edit: workflow steps (upload files, advance steps, QC assignments, enter-work checklist)
- ❌ Cannot edit: case details (painter status, notes, customer info, insurance, etc.)
- ✅ Can view: all case data, notifications
- RLS enforced at database level via Server Actions

---

## 5. סניפים

- **NETIVOT** (נתיבות)
- **ASHKELON** (אשקלון)

RLS מבטיח שמשתמשים רואים רק את סניפם. CEO רואה הכל, וכך גם `SERVICE_ADVISOR` עם `sees_all_branches=true`.

---

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

**⏭ "דלג" (2026-10-12, עמית):** כפתור ליד "סמן בוצע" בשלבים `PREP_ESTIMATE`, `SEND_TO_APPRAISER`, `ENTER_WORK`, `ISSUE_CATALOG_NUMBERS`, `WASH` (שורות 4,5,7,8,11 במסך — לפי step_key כי המספור זז כשטפסי גלגלים מוסתרים). `skipStep()` ב-`actions/workflow.ts` (`SKIPPABLE_STEPS`, חייב להתאים ל-`SKIPPABLE_STEP_KEYS` בקומפוננטה): state=`SKIPPED` עם `completed_by/at`, מפעיל את השלב הבא, audit `STEP_SKIPPED` (מוצג בהיסטוריה "דולג: …"). **ללא** תופעות הלוואי של השלב (התראות/אישורים). צבע ייעודי: ענבר ⏭ (דילוג אוטומטי של גלגלים לרכב צעיר נשאר אפור — `completed_by` ריק).

**חסימות:**
- `READY_FOR_OFFICE` / `SEND_COMPLETION_PHOTOS`: חסום **רק** אם יש extras IN_TREATMENT. **אין יותר שער אישור CEO לאומדן בשלב האחרון** (עמית, 2026-10-12) — האומדן מאושר באמצע ה-workflow; השער תקע תיקים שאישורם "נדחה" (בקשה שנדחתה לא נפתחה מחדש, אז לא היה מה לאשר)
- `CLOSE_CASE`: רק בדיקה משותפת שאין extras ב-IN_TREATMENT — **גם בעמוד הסגירה אין יותר חסימת "חסר אישור CEO"** (`blockedByApprovals=false`, 2026-10-12)
- **אומדן שנדחה → אישור חוזר (2026-10-12):** יש **שורה אחת בלבד** ב-`ceo_approvals` לכל (תיק, סוג) — `uniq_ceo_approvals_case_type`. הקוד הישן ניסה להכניס שורת PENDING חדשה אחרי דחייה ונכשל בשקט (duplicate key) → המנכ"ל לא קיבל בקשה והתיק נתקע (8 תיקים פתוחים). עכשיו `requestCeoApproval()` ב-`actions/workflow.ts` מכניס אם אין, או **מחזיר שורה REJECTED ל-PENDING** (`decided_at/by` מתאפסים, הערת הדחייה נשמרת) ומודיע למנכ"ל. מופעל: (1) כפתור "📤 שלח אומדן לאישור חוזר" (`EstimateRejectedBanner` בעמוד התיק, `requestEstimateReapproval`, SM/SA/CEO/OFFICE); (2) אוטומטית בהשלמת `PREP_ESTIMATE` כשהאחרון REJECTED; (3) בהשלמת `WAIT_APPRAISER_APPROVAL`. לעולם לא להכניס שורת אישור שנייה לאותו סוג. הבאנר מוצג רק כשהרכב עדיין בטיפול (`isActive`) — בתיק שעבר למשרד/נסגר דחייה ישנה לא רלוונטית ולא מוצגת.

---

## 7. Workflow סגירה (4 שלבים)

| # | step_key | שם עברי |
|---|----------|---------|
| 0 | `CLOSURE_VERIFY_DETAILS_DOCS` | אימות מסמכים ופרטים |
| 1 | `CLOSURE_PROFORMA_IF_NEEDED` | פרופורמה אם נדרש |
| 2 | `CLOSURE_PREPARE_CLOSING_FORMS` | הכנת טפסי סגירה |
| 3 | `CLOSE_CASE` | סגירה סופית |

**פותח אוטומטית** כשמשלימים `READY_FOR_OFFICE` ב-workflow המקצועי.

---

## 8. עמודים לפי Role

| Role | עמודים |
|------|--------|
| SERVICE_MANAGER | `/cases`, `/cases/[id]`, `/painters/[id]` (עונה לבקשות פחח), `/extras`, `/notifications` |
| OFFICE | `/cases`, `/cases/[id]`, `/closure`, `/referrals`, `/notifications` |
| CEO | **הכל** + `/approvals`, `/painters`, `/painters/[id]`, `/referrals`, `/settings` |
| PAINTER | `/painters` (רשימה), `/painters/[id]` (תיק פחח), `/extras/new`, `/extras/mine` |
| SERVICE_ADVISOR | `/cases` (read-only), `/notifications` |

כל התראה "לפי תיק" מנותבת דרך `/go/[caseId]` שמפנה כל role לעמוד הנכון לו.

**רענון אוטומטי בכל העמודים (2026-10-11):** `<AutoRefresh />` ב-`(dashboard)/layout.tsx` — `router.refresh()` **כל 30 שנ׳** כשהחלון גלוי + בחזרה לחלון (30 לבקשת תומר). קודם היה רק ברשימת התיקים (45 שנ׳), ולכן מסך "סגירה" שנפתח בבוקר המשיך להראות תיק שאילנית כבר סגרה (הסגירה עצמה נשמרה תקין). לא להוסיף רענון פרטי בעמוד — הוא כבר גלובלי

**"יועץ מטפל" אצל הפחחים (2026-10-11, בקשת עמית):** בלוח הפחחים (כרטיס + חלון מהיר) ובעמוד תיק הפחח — למי לפנות. אין שדה שיוך: נגזר ב-`getCaseAdvisors()` (`src/lib/caseAdvisors.ts`) מ**היועץ הראשון שהשלים שלב מקצועי** בתיק (SERVICE_ADVISOR/SERVICE_MANAGER; שם אחד, לא משתנה אחר כך; בלי שלבים = "טרם שויך"). עמית: המשרד לא יודע מי פנוי — היועצים מתחלקים, ומי שנוגע ראשון משויך. service client — לקרוא רק עם מזהי תיקים שעברו RLS. **גם בפעמון** (2026-10-11): תג "👤 יועץ" ליד מספר הרכב (`getAdvisorsForCases` ב-`src/app/actions/caseAdvisors.ts`, מסנן דרך RLS), ושם הלקוח ומספר הרכב מוסרים מגוף ההתראה (`bodyWithoutCaseInfo`) כי הם כבר בכותרת — עמית: "כפילות בשמות"

**✅ "סיום עבודה" לפחח (2026-10-12, עמית):** כפתור בעמוד תיק הפחח (`setPainterFinished` ב-`actions/painter.ts`; פחח/מנהל שירות/יועץ/CEO). ממלא `cases.painter_finished_at/_by` (מיגרציה `20261012120000`) ו-`painter_status='READY_FOR_RELEASE'`; **הרכב יורד רק מלוח הפחחים** (`/painters` מסנן `painter_finished_at IS NULL`) ונשאר ב"תיקים" עד הסגירה של המשרד. תזכורת "רכב ממתין לעבודה" לא נשלחת לרכב שסומן. "↩️ החזר ללוח" מבטל. היועצים מקבלים `PAINTER_FINISHED` ("✅ הפחח סיים עבודה" — kind CASE_FLOW).
**📝 סטטוס תיק בסגירה (2026-10-12, עמית):** יומן עדכונים ידני כמו "מעקב הפנייה" — `closure_status_updates` (מיגרציה `20261012140000`, OFFICE/CEO בלבד ב-RLS) דרך `actions/closureStatus.ts`; העדכון האחרון מועתק ל-`cases.closure_status_note/_at` ומוצג בולט (צהוב) על כרטיס התיק ב-`/closure`. בעמוד הסגירה: `ClosureStatusSection` בראש העמוד.
**פעמון — "✓ סמן כנקראו" גם ב"לטיפולי"** (`markActionsRead`): מסמן את סוגי "לטיפולי" של התפקיד; אישורים ממתינים ובקשות פחח פתוחות נשארים ברשימה עד הטיפול (לפי מצב, לא לפי נקרא).

**📦 החזרת חלקים (`/returns`, 2026-10-12, אפיון עמית):** טבלה `part_returns` + bucket פרטי `part-returns` (מיגרציות `20261012090000` תפקידים, `20261012090100` טבלה/RLS/התראות). מחליף במקביל את Google Forms/Sheets של עמית (בלי ייבוא — מתחילים נקי).
- **תפקידים חדשים:** `WAREHOUSE` (מחסנאי: שי, לירון) ו-`WAREHOUSE_MANAGER` (מנהל מחסן: רועי) — ב-`STAFF_JOBS`, בית `/returns`, כל פעולות `role_permissions` כבויות.
- **זרימה:** `WAITING_PICKUP` (סימון: פחח/יועץ/מחסנאי, **צילום מדבקה חובה**, ספק מרשימה או "אחר", סיבה, כמות, מק"ט/תיאור, מספר מסמך; מספר רכב → תיק פתוח אוטומטית, אחרת "כללי") → `COLLECTED` (מסירה לנהג: בוחרים ספק, מסמנים כמה חלקים, שם נהג — נזכר ב-localStorage לכל ספק) → `CREDITED` (חשבונית זיכוי + סכום, רק `WAREHOUSE_MANAGER`/CEO) או `DISPUTE`; `CANCELLED` רק לפני איסוף.
- **גישה (RLS):** מעקב מלא — CEO, יועצים, מנהל שירות, מחסנאים, מנהל מחסן (`can_track_part_returns()` + סניף); פחח רואה רק מה שהוא סימן. תמונות דרך service client + signed URLs (אין policies על ה-bucket).
- **התראות:** `PART_RETURN_NEW` → מחסנאים בלבד; `PART_RETURN_OVERDUE_7` → מנהל מחסן; `PART_RETURN_OVERDUE_14` → מנכ"ל (סבב 7 ב-cron, `alert7_sent_at`/`alert14_sent_at`). **חריג מ"מנכ"ל מקבל הכל"** לבקשת עמית — ב-`notification_is_relevant` סוגי החלקים נבדקים לפני שורת ה-CEO.
- **חשבוניות + חיפוש + טבלה (2026-10-12, עמית):** עמודות `invoice_path` / `credit_invoice_path` (מיגרציה `20261012190000`, באקט `part-returns`); `document_number` = מספר חשבונית המקור. `attachInvoicePhoto` (FormData id/kind/number/photo) — מקור: צד המחסן או מי שסימן; זיכוי: CREDIT_ROLES. בכל כרטיס "📷 צלם חשבונית מקור" (גם בדיעבד — באשקלון הנייר מגיע יום-יומיים אחרי), בזיכוי צילום חשבונית זיכוי אופציונלי. חיפוש למעלה (חלק/מק"ט/חשבוניות/רכב/נהג) מציג טבלה; לשונית "📋 טבלה" = כל ההחזרות.
- **בתיק:** `CasePartReturns` מעל פרטי התיק — "X חלקים הוחזרו — לזכות מהאומדן".
- **🔒 תצוגה מקדימה — מנכ"ל בלבד (תומר, 2026-10-12):** `PART_RETURNS_ROLES = true` ב-`src/lib/partReturns.ts` (`canUsePartReturns`) מסתיר את הלשונית, העמוד, התיבה בתיק וכל הפעולות מכל מי שאינו CEO, ולא שולח התראות "חלק חדש". לירון (WAREHOUSE) הושבת זמנית (`is_active=false`). **לפתיחה:** להעביר ל-`false` + להפעיל את לירון.
- **עוד לא:** קריאת מדבקה אוטומטית (ממתין להחלטה על AI vision); חיבור לגיליון של עמית.

**חיפוש תיק בכותרת (🔍, כל התפקידים, 2026-10-11, בקשת עמית):** `src/components/CaseSearch.tsx` + `searchCases()` ב-`src/app/actions/search.ts`. לפי מספר רכב (גם חלקי, מקפים מותרים) או שם לקוח, תיקים פתוחים **וסגורים** (פתוחים קודם), עד 20 תוצאות. רץ עם הסשן של המשתמש → RLS קובע מה רואים (נבדק בהתחזות לפחח). תוצאה → `/go/[id]`. החיפוש שבתוך `/cases` (`CasesMasterDetail`) נשאר — הוא מסנן רק את הרשימה הפתוחה

**רשימת התיקים (`/cases`):** ממוינת לפי תאריך פתיחה, **מהחדש לישן** — תיק חדש למעלה (2026-10-07, לבקשת עמית; קודם לכן ישן→חדש, מה שגרם לצוות לחשוב שהאפליקציה לא מתעדכנת). כל שורה מציגה "נפתח DD/MM/YYYY". הדחיפות (נדחה/חסום/ממתין) לא קובעת מיקום ולא צבע רקע — היא מוצגת בתג בלבד. **צבע אחד בלבד (עמית, 2026-10-07):** כרטיס/שורה **צהובים** = יש לי התראה שלא נקראה על התיק; **לבן** = אין. בדסקטופ — רשת כרטיסים ("קוביות") במקום טבלה.

---

<important if="you need to understand or modify database schema, tables, or migrations">

## 9. DB Schema — טבלאות עיקריות

### `cases` — תיק תיקון
| עמודה | סוג | הערות |
|-------|-----|-------|
| `id` | uuid PK | |
| `branch_id` | uuid FK→branches | |
| `car_id` | uuid FK→cars | |
| `case_key` | text | `{plate}-{claim\|\|PRIVATE}`. ייחודי ל-(סניף, case_key) **רק בתיקים פתוחים ולא מחוקים** (`idx_cases_case_key_branch`, מיגרציה `20261011120000`, 2026-10-11) — קודם גם תיק מחוק/סגור חסם פתיחת תיק חדש לאותו רכב |
| `general_status` | enum | NEW/IN_PROGRESS/COMPLETED |
| `parts_status` | enum | NO_PARTS/ORDERED/AVAILABLE/AIRMAIL_PENDING |
| `customer_name` | text | |
| `phone` | text | |
| `insurance_company` | text | |
| `appraiser_name` | text | |
| `event_date` | date | |
| `sub_claim_type` | enum | POLICY/THIRD_PARTY/MILITARY/OTHER |
| `insurance_type` | enum | COMPREHENSIVE/THIRD_PARTY/PRIVATE/OTHER |
| `claim_type` | enum | PRIVATE/ACCIDENT/FLOOD |
| `fixcar_link` | text | |
| `wheels_check_link` | text | |
| `painter_status` | text | IN_WORK/WAITING_PARTS/PARTS_ARRIVED/READY_FOR_RELEASE/OTHER |
| `parts_ordered` | bool | |
| `parts_arrived` | bool | |
| `qc_assignee` | text | שם יועץ שביצע QC |
| `estimate_link` | text | |
| `closure_checklist_state` | jsonb | מצב צ'קליסט סגירה |
| `appraiser_status` | text | APPROVED/NOT_APPROVED/WAITING_SETTLEMENT |
| `notes` | text | |
| `opened_at` | timestamptz | |
| `treatment_finished_at` | timestamptz | מתי הושלם workflow מקצועי |
| `closed_at` | timestamptz | מתי נסגר התיק |
| `created_by` | uuid FK→profiles | |
| `deleted_at` / `deleted_by` | timestamptz / uuid | **Soft delete** — כל שאילתת SELECT על cases חייבת לסנן `deleted_at IS NULL` |
| `enter_work_checklist_state` | jsonb | items שסומנו ב-ENTER_WORK |
| `catalog_numbers_assignee` / `parts_discounts_assignee` / `completion_photos_assignee` | text | מי ביצע כל שלב |
| `painter_reminder_sent_at` / `office_reminder_sent_at` | timestamptz | שער חד-פעמי לתזכורות אוטומטיות |

### `profiles` — משתמשים
| עמודה | סוג | הערות |
|-------|-----|-------|
| `id` | uuid = auth.uid() | |
| `full_name` | text | |
| `role` | enum user_role | |
| `branch_ids` | uuid[] | **Multi-branch (046):** array של branch UUIDs. Empty [] = CEO (כל הסניפים). OFFICE staff יכולות להיות 2+ סניפים |
| `is_active` | bool | |
| `is_bodywork_advisor` | bool | האם מקבל התראות פחח + ברשימת QC |
| `sees_all_branches` | bool | לרוב ל-SERVICE_ADVISOR — רואה כל הסניפים בלי להיות CEO |

### `cars`
- `license_plate`, `make`, `model`, `year`, `vin`, `vehicle_type`, `first_registration_date`
- ⚠️ **פתיחת תיק ממלאת רק `vehicle_type`** — `make`/`model` נשארים כמעט תמיד ריקים בפועל

### `case_workflow_runs`
- `case_id`, `workflow_type` (PROFESSIONAL/CLOSURE), `status` (ACTIVE/COMPLETED)

### `case_workflow_steps`
- `run_id`, `step_key`, `state` (PENDING/ACTIVE/DONE/SKIPPED), `order_index`, `completed_by`, `completed_at`

### `ceo_approvals`
- `case_id`, `approval_type` (ESTIMATE_AND_DETAILS/WHEELS_CHECK/CASE_CLOSURE), `status` (PENDING/APPROVED/REJECTED), `rejection_note`
- unique index על `(case_id, approval_type)` (020)

### `bodywork_extras`
- `case_id`, `description`, `image_path`, `status` (IN_TREATMENT/REJECTED/DONE), `created_by`

### `notifications`
- `user_id`, `case_id` (nullable), `type`, `title`, `body`, `read`, `triggered_by`, `action_url`
- **fan-out (031/032/041):** כל INSERT מפעיל טריגר `fanout_notifications_to_ceos()` שמשכפל להתראה לכל CEO ולכל SERVICE_ADVISOR עם `sees_all_branches=true`

### `push_subscriptions` (021/022)
- `user_id`, `endpoint`, `p256dh`, `auth`, `user_agent`, `last_used_at` — Web Push API subscriptions
- RLS: `user_id = auth.uid() OR CEO`

### `audit_events`
- `entity_type` (CASE/WORKFLOW_STEP/APPROVAL/EXTRA), `entity_id`, `action`, `user_id`, `payload`

### `painter_requests`
- `case_id`, `description`, `request_type` (WORK/PARTS), `status` (PENDING/IN_PROGRESS/DONE/REJECTED), `response_note`, `created_by`, `reminder_sent_at`

### `painter_request_images`
- `request_id`, `image_path` (bucket: `painter-images`)

### `referrals` (039) — הפניות טרום-תיק
- `branch_id`, `customer_name`, `insurance_company`, `claim_type`, `vehicle_type`, `vehicle_year`, `plate_number`, `appraiser_name`, `phone`
- `status_note`, `status` (ACTIVE/CONVERTED/CANCELLED), `case_id`, `current_status_tag`, `follow_up_date`, `follow_up_reminder_sent_at`
- `important_notes` (2026-09-30) — הערות חשובות נעוצות: תיבה צהובה בראש עמוד ההפנייה + שורת ⚠️ בכרטיס ברשימה. נפרד מיומן המעקב (`referral_status_updates`), שהוא היסטוריה ולא אזהרה קבועה. **עוברת לתיק בהמרה:** `convertReferral()` מוסיפה אותה בראש `cases.notes` תחת הכותרת "⚠️ הערות חשובות מההפנייה:" (בלי כפילות; כשל בהעתקה נרשם ללוג ולא מבטל את ההמרה)

### `referral_status_updates` (042) — יומן מעקב הפניה
- `referral_id`, `status_tag` (AWAITING_REPLACEMENT_CAR/AWAITING_PAPERWORK/AWAITING_SCHEDULING/OTHER), `note`, `created_by`, `created_at`

### `referral_documents`
- `referral_id`, `file_name`, `file_path` (bucket: `referral-documents`), `file_size`, `mime_type`, `uploaded_by`

### `case_documents`
- `case_id`, `file_name`, `file_path`, `file_size`, `mime_type`, `document_type`, `uploaded_by`

### `role_permissions`
- `role`, `action`, `enabled` — מטריצת הרשאות דינמית. **מקור האמת היחיד** להרשאות (2026-09-18). ראה Standing Rule #5.
- 5 תפקידים × 9 פעולות = 45 שורות. הטבלה חייבת להישאר מלאה: שילוב חסר נחשב **אסור**.
- נקראת אך ורק דרך `has_permission(action)` — לא לשאול את הטבלה ישירות בקוד.

### `workflow_step_templates`
- `step_key`, `step_label`, `order_index`, `is_enabled`, `requires_link`, `requires_file_or_link`, `requires_ceo_approval`

### `system_messages`
- `message`, `is_active` — הודעות מערכת לכל המשתמשים

### `branches`
- `name` — NETIVOT / ASHKELON

### `schema_migrations` (036)
- `filename`, `applied_at` — מעקב פורמלי אחרי אילו מיגרציות רצו בפרודקשן

---

## 10. Storage Buckets

| Bucket | שימוש | גישה |
|--------|--------|------|
| `extras-images` | תמונות תוספות פחחות | Private, authenticated |
| `painter-images` | תמונות בקשות פחח | Private, authenticated |
| `referral-documents` | מסמכים מצורפים להפניה | Private, authenticated, RLS לפי סניף ותפקיד (039) |

</important>

---

<important if="you need to call or modify a Server Action">

## 11. Server Actions — מפה מלאה

### `workflow.ts`
- `createCase(input)` — יוצר car + case + workflow run + steps
- `completeActiveStep(caseId, stepId)` — מסמן שלב DONE, מפעיל הבא
- `returnToEstimate(caseId)` — מחזיר ל-PREP_ESTIMATE
- `deleteCase(caseId)` — **soft delete** (CEO בלבד)
- `restoreCase(caseId)` — שחזור תיק מחוק (CEO בלבד)

### `approvals.ts`
- `getApprovals()` — שולף אישורים פנדינג
- `decideApproval(id, status, note)` — אישור/דחייה + revalidatePath

### `caseDetails.ts`
- `updateCaseDetails(caseId, caseUpdates, carUpdates?)` — עדכון inline של שדות

### `documents.ts`
- `uploadCaseDocument(formData)` — העלאה ל-storage + DB record
- `deleteCaseDocument(id)` — מחיקה
- `getSignedFileUrls(bucket, paths)` — signed URLs מרובים

### `extras.ts`
- `createExtra(input)` — יצירת תוספת פחח עם upload תמונה
- `updateExtraStatus(id, status)` — שינוי סטטוס (SERVICE_MANAGER/CEO)

### `painter.ts`
- `updatePainterChecklist(caseId, updates)` — נכנס לעבודה / התקבל חלקים
- `createPainterRequest(caseId, desc, type, images?)` — בקשת תוספת + התראה
- `getPainterRequests(caseId)`
- `updatePainterRequestStatus(id, status, note?)` — סטטוס כולל `REJECTED`

### `referrals.ts`
- `createReferral(input)` / `updateReferral(id, updates)` / `cancelReferral(id)` — CRUD בסיסי
- `convertReferral(referralId, caseId)` — נקרא אחרי יצירת תיק מההפניה
- `addReferralStatusUpdate(id, statusTag, note)` — מוסיף שורה ליומן המעקב
- `getReferralStatusUpdates(id)` — שולף את היומן
- `setReferralFollowUpDate(id, date)` — קובע/מנקה תאריך תזכורת
- `uploadReferralDocument(formData)` / `deleteReferralDocument(id)`

### `settings.ts`
- `getRolePermissions()` / `updateRolePermission(role, action, enabled)`
- `getWorkflowStepTemplates()` / `updateWorkflowStep()` / `addWorkflowStep()` / `removeWorkflowStep()`
- `getBodyworkAdvisors()` / `toggleBodyworkAdvisor(profileId, isAdvisor)`

### `notifications.ts`
- `getNotifications()` / `markAsRead(id)` / `markAllAsRead()`

### `push.ts`
- `savePushSubscription(sub)` / `removePushSubscription(endpoint)` — ניהול Push API subscription
- `sendPushToUser(userId, payload)` — שולח web push
- `pushToOverseers(payload, excludeUserId?)` — שולח לכל CEO + SERVICE_ADVISOR
- `sendTestPushToSelf()` — כלי אבחון

### `vehicleLookup.ts`
- `lookupVehicleByPlate(plate)` — שולף סוג/שנת רכב מ-data.gov.il

### `reports.ts`
- `sendSummaryReport()` — דוח סיכום יומי דרך Resend, CEO-only

</important>

---

<important if="you need to understand the automation system or modify notification triggers and reminders">

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
Route יחיד עם שישה סבבים. **מופעל כל 30 דקות ע"י `pg_cron` ב-Supabase** (job `tehila-reminders`, מיגרציה `20261011220000`, עם הסוד `push_dispatch_secret` מה-Vault בכותרת `x-dispatch-secret`). עד 2026-10-11 הופעל ע"י GitHub Actions — שבפועל רץ רק 3–4 פעמים ביום (ה-workflow ב-origin נשאר כגיבוי, עם `CRON_SECRET`). כל סבב אידמפוטנטי.

| # | מה בודק | תנאי | מגבלה |
|---|---------|------|--------|
| 1 | `ENTER_WORK` הושלם אך `painter_entered_work_at` ריק | **פעם ביום לכל רכב, בבוקר** (2026-10-11; קודם כל ~110 דק׳) | 09:00–12:00, א׳–ה׳, בלי חגים |
| 2 | בקשת פחח PENDING | אחרי שעה | חד-פעמי; לא יותר מ-48 שעות אחורה |
| 3 | תיק מוכן לסגירה, אף OFFICE לא פתח את ההתראה | אחרי שעה | חד-פעמי; לא יותר מ-48 שעות אחורה |
| 4 | הפניה עם `follow_up_date` שהגיע | ביום שנקבע | חד-פעמי, בלי הגבלת גיל |
| 5 | מייל גיבוי להתראה לטיפול שלא נקראה | שעה אחרי | עד 50 ביום |
| 6 | **דוח סוף יום** לעמית (`src/lib/dailyReport.ts`, 2026-10-10): הפניות שנפתחו לתיקים היום, הפניות פתוחות, תיקים פתוחים, תיקים שנסגרו היום — נתיבות/אשקלון/סה"כ | מ-18:00 (`DAILY_REPORT_HOUR`), א׳–ה׳ בלי חגים | פעם ביום: `Idempotency-Key` של Resend לפי תאריך (409 = כבר נשלח), בלי טבלה |

</important>

---

<important if="you need to modify or create RLS policies or understand branch-based access control">

## 13. RLS Policy Pattern

**כלל ראשי:** כל טבלה מוגנת לפי `branch_ids` של המשתמש (array), דרך פונקציות helper:
- `public.get_my_branch_ids()` — ה-branch_ids array של המשתמש המחובר
- `public.get_my_role()` — ה-role של המשתמש המחובר
- `public.can_see_all_branches()` — true עבור CEO ועבור כל role עם `sees_all_branches=true`
- **RLS Operator (046):** `branch_id = ANY(public.get_my_branch_ids())` — בודק אם branch של הרשומה נמצא בarray

⚠️ **חשוב:** 
- מיגרציה 018 הצהירה שהיא יוצרת `current_user_branch_id()`/`current_user_role()`, אבל בפועל הפונקציות הן `get_my_branch_id()`/`get_my_role()`
- **מיגרציה 046** שינתה את `get_my_branch_id()` ל-`get_my_branch_ids()` ועדכנה את כל ה-RLS policies להשתמש ב-`= ANY()` operator

**Soft delete:** `cases_select` מסנן `deleted_at IS NULL` — וכל שאילתת select אחרת על cases צריכה לעשות את זה בעצמה גם ברמת האפליקציה.

**הרצת SQL:** קיים Supabase CLI מקומי מקושר לפרוד. הרצת מיגרציות דרך `supabase db push` או ידנית ב-SQL Editor, תמיד עם backup. תמיד לכתוב מיגרציות עם `DROP POLICY/TRIGGER/CONSTRAINT IF EXISTS` לפני `CREATE`.

</important>

---

<important if="you are creating new components or refactoring existing patterns">

## 14. ארכיטקטורת הקוד

### Server Component → Client Component Pattern
```
page.tsx (async Server Component)
  → fetches all data from Supabase
  → passes as props to:
    CaseDetailClientV2.tsx (Client Component)
      → manages local state, optimistic updates
      → calls Server Actions
      → calls reloadStepsFromDB() via Supabase client after mutations
```

### Optimistic Updates
- שלבי workflow מעודכנים אופטימית ב-`localSteps` state
- שגיאה → revert
- Reload מה-DB אחרי כל mutations

### הודעות עם highlight/deep-link
דפוס חוזר בכל המערכת: `action_url` של התראה כולל `?highlight=<id>`, והקומפוננט הרלוונטי קורא את הפרמטר עם `useSearchParams`, גולל אליו ומדגיש אותו חזותית. כל צרכן בודק בעצמו שה-id קיים — אם לא, זה no-op שקט.

</important>

---

<important if="you need to locate a specific module or understand file organization">

## 15. נתיבי קבצים קריטיים

| קובץ | מה הוא עושה |
|------|-------------|
| `src/app/(dashboard)/cases/[id]/CaseDetailClientV2.tsx` | הקומפוננט הכבד ביותר — צ'קליסט, פרטי תיק, בקשות פחח, מסמכים, אודיט |
| `src/app/(dashboard)/cases/[id]/page.tsx` | Server Component — שולף הכל, מעביר ל-Client |
| `src/app/(dashboard)/cases/[id]/PainterRequestsSection.tsx` | בקשות פחח בתוך התיק |
| `src/app/actions/workflow.ts` | לוגיקת ה-workflow המרכזית |
| `src/app/actions/referrals.ts` | הפניות, יומן מעקב, תזכורות |
| `src/app/actions/push.ts` | Web Push + fan-out לנמעני התראות |
| `src/app/api/cron/enter-work-reminders/route.ts` | כל תזכורות ה-cron (4 סבבים) |
| `src/app/go/[id]/page.tsx` | ניתוב role-neutral להתראות |
| `src/types/database.ts` | כל ה-types — הראשון לעדכן בשינויי schema |
| `src/db/migrations/` | מיגרציות SQL 001–046 — היסטוריה קפואה |
| `supabase/migrations/` | מיגרציות CLI חדשות — baseline `20260901180001_remote_schema.sql` |
| `src/app/(dashboard)/layout.tsx` | Navigation לפי role |
| `src/app/(dashboard)/painters/[id]/PainterCaseClient.tsx` | ממשק הפחח הנפרד |
| `src/app/(dashboard)/painters/PaintersBoard.tsx` | לוח כרטיסי הפחחים |
| `src/app/(dashboard)/referrals/[id]/ReferralDetailClient.tsx` | פרטי הפנייה, יומן מעקב |
| `src/app/(dashboard)/referrals/ReferralsGrid.tsx` | רשימת הפניות + טאבי סניף |
| `src/app/(dashboard)/settings/BodyworkAdvisorsTab.tsx` | ניהול יועצי פחח |

</important>

---

<important if="you are creating a new migration or need to understand migration history">

## 16. Migrations — היסטוריה

| Migration | תוכן |
|-----------|------|
| 001 | Schema ראשוני, enums, RLS |
| 002 | Storage policies |
| 003-004 | Schema align, seed branches |
| 005 / 005b | case_documents + storage |
| 006 | שדות חדשים בתיק |
| 007 | AIRMAIL_PENDING לparts_status |
| 008 | עדכון workflow steps |
| 009 | role_permissions + workflow_step_templates |
| 010-012 | RLS fixes ל-CEO |
| 013 | painter_status, parts_ordered, qc_assignee |
| 014 | performance indexes |
| 015 | closure_checklist_state (jsonb) |
| 016 | appraiser_status column |
| 017 | soft delete, is_bodywork_advisor, painter_requests |
| 018 | fix RLS recursion |
| 019 | restore CEO bypass for profiles |
| 020 | enter_work_checklist_state, assignees |
| 021-022 / 022b | push_subscriptions |
| 023 | race condition prevention |
| 024-025 | security hardening |
| 026 / 026b | Realtime על notifications |
| 027 / 027b | timestamps לצ'קליסט פחח |
| 028 | `sees_all_branches` |
| 030 | `branch_recipients()` |
| 031-032 | fan-out התראות |
| 033 | storage cross-branch |
| 034 | painter_status='OTHER' |
| 035 | תזכורת ENTER_WORK |
| 036 | `schema_migrations` |
| 037 | sub_claim_type: MILITARY/OTHER |
| 038 | escalation reminders |
| 039 | מודול הפניות |
| 040 | painter_requests REJECTED + `response_note` |
| 041 | CEO מקבל התראות על פעולות עצמו |
| 042 | יומן מעקב הפניות |
| 043 | תאריך תזכורת להפניה |
| 044 | WHEELS_CHECK בלי אישור CEO |
| 045 | Backfill status_note ישן |
| **046** | **Multi-branch OFFICE staff:** `profiles.branch_id` → `branch_ids[]` |

> **2026-09-01 — CLI re-baseline:** מ-046 והלאה עוברים ל-Supabase CLI. `src/db/migrations/001–046` קפואים כהיסטוריה; ה-baseline החדש הוא `supabase/migrations/20260901180001_remote_schema.sql` (= מצב הפרוד ב-046).

</important>

---

<important if="you are deploying to production or configuring Git/Vercel">

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

</important>

---

<important if="you need to test locally with real user accounts">

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

</important>

---

<important if="you are modifying code, schema, or deploying">

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

</important>

---

<important if="you are pushing to production or managing database operations">

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

</important>

---

<important if="you are running migrations, managing the local stack, or applying schema changes">

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

</important>

---

<important if="you need to modify user management or audit features">

## 23. Live Features

### User Creation Form ✅
- **(2026-10-11)** הטופס **בלי סיסמה**: הכניסה היא במייל בלבד, והשרת יוצר את המשתמש עם `EMAIL_ONLY_LOGIN_PASSWORD` (סיסמה שהוקלדה בטופס הייתה נועלת את המשתמש בחוץ). `createNewSystemUser` עובד עם service client (ה-admin API לא עובד בסשן משתמש) ו-**upsert** לפרופיל (הטריגר `on_auth_user_created` כבר יוצר פרופיל ריק) — לפני כן יצירה מההגדרות כנראה לא עבדה מעולם
- **רשימת המשתמשים** מציגה לכל אחד: מייל הכניסה (לחיצה מעתיקה), כניסה אחרונה, 🔔/🔕 אם הפעיל התראות, וחשבונות בדיקה בסוף (לא `@toyota-tehila.co.il`). נקרא עם service client אחרי `requireCeo()`
- CEO can create new users directly from the web UI
- Form collects: email, password, full name, role, branch assignment(s)
- Creates both Auth user and profile record atomically
- Validation: email format, password minimum 8 chars, role+branch constraints
- Error handling: duplicate email detection, atomic creation

### CEO Audit Dashboard ✅
- `/settings` → New "📊 ביקורת" (Audit) tab
- Users Tab: user lifecycle timeline
- Changes Tab: profile modification history
- Activity Tab: user activity log
- Database Schema: `audit_log` table (profile changes), `activity_log` table (page visits)

### Real-Time Sync + Send Report Button ✅
- **Real-Time Profile Sync:** When CEO changes user roles/branches, all logged-in users see updates immediately
- **Send Report Button:** Top header, CEO only, sends summary report via `sendSummaryReport()` Server Action

</important>

---

---

## 24. Critical Bug Fixes — 2026-09-03/2026-09-04 ✅

### Fix #1: SERVICE_ADVISOR Read-Only Enforcement (2026-09-04)

**Status:** ✅ Deployed in Commit `751fb3c`

**Problem:** SERVICE_ADVISOR role (Knarit) could edit all case details despite being read-only:
- Painter status dropdown was editable
- Case notes textarea was editable
- File upload fields were enabled
- Create case button was clickable

**Root Cause:** `CaseDetailsSection.tsx` line 205 incorrectly included SERVICE_ADVISOR in `canEdit` variable:
```typescript
// BEFORE (WRONG):
const canEdit = role === 'SERVICE_MANAGER' || role === 'CEO' || role === 'SERVICE_ADVISOR';
```

**Fix Applied:**
```typescript
// AFTER (CORRECT):
const canEdit = role === 'SERVICE_MANAGER' || role === 'CEO';
const canEditDetails = role === 'SERVICE_MANAGER' || role === 'CEO';
```

**Verification:**
- ✅ File: `src/app/(dashboard)/cases/[id]/CaseDetailsSection.tsx` lines 205-206
- ✅ All write-operation fields now properly disabled for SERVICE_ADVISOR
- ✅ No regressions for SERVICE_MANAGER or CEO (still editable)

---

### Fix #2: OFFICE RLS Policies Deployed (2026-09-04)

**Status:** ✅ Deployed in Migration `20260904_130000_fix_rls_violations.sql`

**Problem:** OFFICE staff (Ilana) could not access `/referrals` page despite having correct RLS policies defined:
- Application-level access check was correct but RLS wasn't deployed
- Migrations had naming collision (two `20260903` files) preventing deployment
- Users were silently redirected away from /referrals

**Root Cause:** Migration filename collision in Supabase CLI:
- `20260903_fix_rls_violations.sql` and `20260903_populate_insurance_branch_mapping.sql` both created version key `20260903`
- Second migration failed to apply with "duplicate key" error

**Fix Applied:**
1. Renamed migrations to unique version prefixes:
   - `20260904_130000_fix_rls_violations.sql` (fixed RLS for referrals + cases + painter_requests)
   - `20260905_010000_populate_insurance_branch_mapping.sql` (populated 24 insurance-branch mappings)

2. RLS Policies Active:
   ```sql
   -- referrals: OFFICE can see their branches only
   CREATE POLICY referrals_select ON public.referrals
     FOR SELECT
     USING (
       (public.get_my_role() = 'CEO')
       OR
       (public.get_my_role() = 'OFFICE' AND branch_id = ANY(public.get_my_branch_ids()))
     );
   
   -- cases: Proper multi-branch access
   CREATE POLICY cases_select ON public.cases
     FOR SELECT
     USING (
       (public.get_my_role() = 'CEO')
       OR
       (branch_id = ANY(public.get_my_branch_ids()))
     );
   ```

**Verification:**
- ✅ Database: Migration `20260904_130000_fix_rls_violations.sql` applied successfully
- ✅ Database: Migration `20260905_010000_populate_insurance_branch_mapping.sql` applied successfully
- ✅ OFFICE (Ilana) can now access `/referrals` with proper branch filtering
- ✅ Data shows: 8 total referrals (3 Netivot + 5 Ashkelon)
- ✅ Insurance dropdown: 12 companies available for both branches

---

### Fix #3: Insurance Branch Mapping Populated (2026-09-04)

**Status:** ✅ Deployed in Migration `20260905_010000_populate_insurance_branch_mapping.sql`

**Problem:** Insurance company dropdown wasn't showing available companies filtered by branch

**Fix Applied:** Inserted 24 records mapping all 12 insurance companies to both branches (Netivot + Ashkelon)

**Verification:**
- ✅ Database: 24 records in insurance_branch_mapping table
- ✅ All 12 insurance companies available for both branches
- ✅ Dropdown now shows proper company list per insurance selection

---

## 25. Standing Rules — מטא-עקרונות שלא משתנים

Standing rules are permanent architectural decisions that shape how Claude Code works on this project. They are **NOT** feature requests or one-time fixes — they are policies that apply to every session, every deployment, and every codebase change.

### 🔴 Standing Rule #1: Autonomous Production Deployment (2026-09-03)

**Policy:** Deploy Validator Agent autonomously deploys to production after successful local build verification. **No manual approval needed.**

**Flow:**
1. Claude makes code changes locally
2. Commits and pushes to BOTH remotes:
   - `origin` (sasha463111/amit-maymon-new) — backup
   - `tomer` (tdavidyan85/amit-maymon-new) — **Vercel watches this**
3. Deploy Validator Agent automatically:
   - Runs `npm run build` locally
   - If ✅ **builds successfully** → Auto-deploys to Vercel production
   - If ❌ **build fails** → Reports error + stops deployment
4. Agent reports all deployments for transparency

**Why this exists:** Manual approval after every build created a bottleneck that defeated the purpose of having autonomous agents.

**Critical details:**
- **Both remotes always:** `git push origin main && git push tomer main`
- **Vercel configuration:** Connected to `tdavidyan85/amit-maymon-new`
- **Build must pass locally** before production deployment
- **No manual "Deploy to production" approval needed**

---

### 🔴 Standing Rule #2: Documentation Sync on Every Production Push (2026-09-01)

**Policy:** Every production push to `main` MUST update the project `.md` files in the SAME commit.

**Files that must sync:**
- `CLAUDE.md` — Technical architecture & implementation notes
- Individual agent documentation files in `.claude/agents/`

**Why this exists:** Drift between code and documentation causes confusion. If the codebase changes, the documentation must change too, or developers (including Claude in future sessions) lose trust and navigate by guessing.

**What counts as a "production change":**
- Code logic changes that affect how features work
- Schema migrations (database changes)
- New features or removed features
- Bug fixes that change observable behavior
- Architecture refactors

**What does NOT require doc updates:**
- Comment-only changes
- Linting/formatting fixes
- Variable renames (internal refactors with no external impact)

---

### 🔴 Standing Rule #3b: Who gets which notification is decided in ONE place — by job (2026-10-11)

**Supersedes the routing table below wherever they differ.** Amit's spec: every person gets only what belongs to their job; what isn't theirs is **not created at all** (not merely hidden).

- **Job = role + office function** (`src/lib/staffJobs.ts`): יועץ/ת שירות, מנהל שירות, **משרד הפניות** (OFFICE + `office_function='REFERRALS'`: אביה, אילנית), **משרד סגירה** (OFFICE + `'CLOSURE'`: אילנה), פחח, מנכ"ל. Chosen in Settings when creating/editing a user — that alone gives a new user the right notifications. Referrals office lands on `/referrals`.
- **The rule** lives in the DB (migration `20261011140000_notifications_by_role.sql`): `notification_kind(type,title)` + `notification_is_relevant(role, office_function, kind)`, enforced by `trg_0_relevant_notifications_only` (BEFORE INSERT → row dropped). Covers every source: app code, cron, the CEO fan-out.

| Job | Gets |
|---|---|
| מנכ"ל | everything |
| יועץ/מנהל שירות | painter requests, personal notes, new case, all case-flow (approvals, rejections, blocked, wash, wheels, extras, closed), entered work, parts arrived |
| משרד הפניות | referral follow-ups (`REFERRAL_FOLLOW_UP`), personal notes |
| משרד סגירה | cases for closure (`READY_FOR_OFFICE` + its reminder), personal notes |
| פחח | entered work, parts arrived, "רכב ממתין לעבודה" reminder, answers to their requests, personal notes |

- **Painter requests in the bell:** stay in "לטיפולי" for every advisor while the request is PENDING (not by read state), tagged "מיועד ל: <יועץ מטפל>"; once handled they move to updates with "✓ טופל".
- **שלב אחד לכל (run, step) (13/10):** `uniq_case_workflow_steps_run_step` (מיגרציה `20261013120000`; היו 0 כפילויות). דף הסגירה: אם יצירת ה-run נכשלת בגלל מרוץ, הוא טוען את ה-run הקיים במקום 404, ולא מוסיף שלבים אם כבר יש.
- **כתיבות קריטיות נבדקות (13/10, סקירת קוד):** ב-`completeActiveStep`, סימון שלב DONE נעשה עם `.in(state,[ACTIVE,PENDING]).select(id)`: 0 שורות או שגיאה מחזירים error (וזה גם מונע השלמה כפולה). אם CLOSE_CASE לא מצליח לסגור את התיק, השלב חוזר ל-ACTIVE. כשל בהפעלת השלב הבא מחזיר הודעה, גם ב-skipStep. כלל: כל כתיבה שהמשתמש מקבל עליה "בוצע" חייבת לבדוק error ושורות. (נבדק עם ההרשאות של נסיה, אילנה וערן: ה-update מחזיר את השורה.)
- **שליחת פוש = `src/lib/pushSend.ts` (לא `use server`) (13/10, תיקון אבטחה).** כל export מקובץ `use server` הוא endpoint ציבורי; `sendPushToUser(…,{direct:true})` היה חשוף, ואפשר היה לשלוח פוש מזויף לכל עובד. ב-`actions/push.ts` נשארים רק save/remove של המנוי שלי ו-`sendTestPushToSelf`. **לעולם לא לייצא משם פונקציות שליחה.**
- **Push = row.** `sendPushToUser()` without `{direct:true}` is a no-op; all pushes go through `trg_dispatch_ceo_push` → `/api/push/dispatch` for every active user with a device. Never push inline again — insert the notification and let the dispatcher push it.
- **רכב לא לתיקון / מושבת (2026-10-13, עמית):** עמודות `cases.written_off_at/_by/_reason` (מיגרציה `20261013100000`). `writeOffCase` ב-`actions/caseWriteOff.ts`: מסמן את התיק כסגור (`closed_at`), כל ה-runs עוברים ל-COMPLETED וההתראות הפתוחות נסגרות. `restoreWrittenOffCase` מבטל את זה ומחזיר את ה-run האחרון ל-ACTIVE. הכפתור והבאנר ב-`cases/[id]/WriteOffControl.tsx`. **מי:** CEO ו-SERVICE_ADVISOR בלבד, גם לסימון וגם ל"החזר לטיפול" (עמית, 14/10). **מחיקת תיק: CEO בלבד** (`role_permissions.delete_cases` כבוי ל-SA/SM). החזרה על ידי מי שאינו CEO שולחת למנכ"ל התראה `CASE_RESTORED`, שנמצאת ברמת ACTION (פוש; מיגרציה `20261013110000`). בארכיון יש לשונית "מושבתים", ומושבתים לא מופיעים ב"סגורים" ולא נספרים כ"נסגרו היום" בדוח היומי.
- **אזור השרתים = bom1 (מומבאי), ליד בסיס הנתונים (2026-10-13).** Supabase יושב ב-`ap-south-1`. ב-`iad1` כל שאילתה לקחה כ-220ms (נמדד), וב-`bom1` היא לוקחת כ-35ms. בקשה עם 5 שאילתות מישראל ירדה מ-1.67 ל-0.73 שניות. הבדיקה: `GET /api/health/db` (5 שאילתות רצופות, מחזיר רק זמנים ואזור). לא להחזיר ל-iad1. השלב הבא, אם יידרש: להעביר את בסיס הנתונים לפרנקפורט + `fra1` (`SUPABASE_MIGRATION_GUIDE.md`).
- **Pixcar בתיק הפחח (2026-10-13, עמית):** כפתור "📸 צפייה בתמונות Pixcar" ב-`painters/[id]` מתוך `cases.fixcar_link` (רק קישור http/https, נפתח בטאב חדש).
- **קריאת מדבקות ב-Claude (14/10, עמית):** `src/lib/stickerReader.ts` (Haiku `claude-haiku-5-5`, tool `report_sticker`) + `readPartSticker` ב-`actions/partReturns.ts`. בטופס ההחזרה, צילום המדבקה ממלא רק שדות ריקים (עדכון פונקציונלי, מה שהמשתמש הקליד נשאר), ומוצגת הודעת סטטוס. **המפתח:** Supabase Vault בשם `anthropic_api_key`, נקרא דרך `get_app_secret()` (service_role בלבד; מיגרציה `20261014090000`), או `ANTHROPIC_API_KEY` ב-env. בלי מפתח, הטופס ידני כמו קודם. עמודה `part_returns.sticker_date`.
- **תזכורת כרטסות חודשית (14/10, עמית):** סבב 8 ב-cron (`runSupplierStatementReminder`): ביום עבודה בשבוע הראשון של החודש, מ-09:00, פעם בחודש (claim `supplier-statement/YYYY-MM` ב-`sent_emails`). WAREHOUSE_MANAGER מקבל `SUPPLIER_STATEMENT_REMINDER`, ו-CEO מקבל `SUPPLIER_STATEMENT_FYI` (ACTION/פוש). מיגרציה `20261014070000` מעדכנת את notification_kind/is_relevant/ceo_tier. **דוח יומי:** רשימת הרכבים שנפתחו היום לפי סניף (`opened` ב-buildDailyReport).
- **14/10, עמית:** (1) העברת תיק בין סניפים: `BranchSwitcher` בפרטי התיק, ו-`moveCaseToBranch` ב-`actions/caseBranch.ts` (CEO/SM/SA/OFFICE, רק לסניף שיש להם גישה אליו; גם הרכב עובר; ב-unique conflict מוצגת הודעה; audit). (2) "תוספת חדשה" הוסר מהתפריט. (3) `PAINTER_STATUS_LABELS` מורחב: ממתין לשינוע / ממתין לשמאות / ממתין לחלקים / הגיעו חלקים / בעבודה / גמר עבודה - שחרור (המפתח READY_FOR_RELEASE נשאר) / מושבת / אחר+טקסט. השדה הוא text, בלי מיגרציה. בדף הפחח יש `PainterStatusPicker`. בלוח הפחחים: 4 הסטטוסים העיקריים תמיד, השאר רק כשיש בהם רכב.
- **📲 קישור ללקוח להעלאת מסמכים (14/10, עמית, פיילוט):** בפרטי ההפניה יש `CustomerLinkPanel`. `createCustomerDocLink` יוצר טוקן אקראי של 32 בתים; ב-DB נשמר **רק ה-SHA-256** (`customer_doc_links`, מיגרציה `20261014140000`). הקישור בתוקף 72 שעות, ונשאר רק קישור חי אחד: יצירת קישור חדש מבטלת את הקודם. אחר כך נפתח `wa.me` עם הודעה שנבנית לפי שם הפקידה והסניף (`customerMessage`). הקישור מוצג פעם אחת ולא נשמר. **דף ציבורי `/d/[token]`** (מחוץ ל-dashboard, noindex, no-referrer): מציג רק שם פרטי ומספר רכב, ואז נוסח הסכמה (`consentText`, הגרסה נשמרת עם IP/UA) ורשימת מסמכים (`docItemsFor`, זמנית עד שעמית ישלח את הערכה לפי סוג תביעה). **API `/api/customer-docs`**: `consent` / `upload` / `done`. בהעלאה: תמונה או PDF בלבד, עד 20MB ועד 40 קבצים לקישור. שם הקובץ של הלקוח לא נכנס לנתיב. הקובץ נשמר ב-bucket הפרטי `referral-documents`, ושורה ב-`referral_documents` עם `doc_kind` / `via_link_id` / `upload_ip` / `upload_ua` ו-`uploaded_by=null`. הפקידה ששלחה מקבלת התראה `CUSTOMER_DOCS` (kind REFERRAL) בקובץ הראשון וב"סיימתי". RLS: staff רק קוראים (כל הכתיבה דרך השרת עם service role), ול-anon אין גישה. **מי שולח:** `CUSTOMER_LINK_ROLES = ['CEO']` ב-`src/lib/customerDocs.ts` עד שעורכי הדין (רון ויוסי) יאשרו את הנוסח; אז מוסיפים OFFICE. באנר ה-push מוסתר ב-`/d/`.
- **מסך סגירה (14/10):** (1) הצ׳קליסט וכפתור העלאת המסמכים תלויים ב-`sub_claim_type` (`CLOSURE_CHECKLIST`). ל-34 תיקים לא הוגדר סוג תביעה, ולכן במסך שלהם לא היה צ׳קליסט. עכשיו, כשאין צ׳קליסט, מוצגת בחירת סוג תביעה (`chooseSubType` → `updateCaseDetails`), והצ׳קליסט מופיע מיד. (2) **"💰 נתוני סגירה לכספים"** (`FinanceEntryCard.tsx`, OFFICE + CEO): העמודות מהאקסל של אילנה (מקור עבודה, חברת ביטוח, סוג תביעה, קטגוריית צה"ל, שמאי מהרשימה ב-`src/lib/finance.ts`, סכום עם הנחות, סכום ש.י.ר ללא הנחות, מספר חשבונית, השתתפות עצמית, כרטיס עבודה). ערכי ברירת המחדל נגזרים מ-`sub_claim_type`. `saveFinanceEntry` ב-`actions/financeClosures.ts`: בודק תפקיד וגם שהתיק גלוי למשתמש לפי RLS, ואז כותב עם service role (הטבלה CEO-only). שורה אחת לכל תיק (unique index חלקי, מיגרציה `20261014180000`). שדות מועד פירעון (עמית, 14/10; מיגרציה `20261014210000`): `claim_check_due_date` (צ׳ק תביעות, מוצג רק כשסוג התביעה צד ג׳) ו-`deposit_check_due_date` (רשות, מסמנים "יש צ׳ק פיקדון"), ולכל אחד מהם גם סכום: `claim_check_amount` / `deposit_check_amount` (מיגרציה `20261014220000`). המטרה: הצלבה עם הגבייה (מסלקות התביעות ספיר מימון, גלית וענונו, ליטל ביטון; מסך הגבייה מחכה לאפיון של מנהלת החשבונות). **סגירת תיק חסומה עד שמזינים נתוני כספים** (עמית, 14/10): `completeActiveStep` בשלב CLOSE_CASE בודק (עם service client) שקיימת שורה ב-`finance_closures` לאותו case_id, ואם הבדיקה עצמה לא יכולה לרוץ, הסגירה לא נחסמת. במסך, הכפתור מציג "🔒 סגירה חסומה" עם הסבר עד השמירה (`financeDone`, `onSaved`).
- **👩‍💼 מנהלת חשבונות — `ACCOUNTANT` (חני, chani@, 14/10, עמית):** מיגרציות `20261014280000` (enum) ו-`20261014280100`. בתפריט: כספים, גבייה, החזרות, הודעות והתראות, וגם דשבורד גבייה (יש לה שורה ב-`finance_viewers`). הבית שלה הוא `/finance`. **כספים:** קריאה בלבד (policy `finance_closures_accountant_read` + `is_active_accountant()`. ניסיון update מעדכן 0 שורות, נבדק בהתחזות). **החזרות:** `can_track_part_returns()` כולל ACCOUNTANT, והיא ב-PART_RETURNS_ROLES, ב-CREDIT_ROLES (רישום זיכויים) וב-DOC_ROLES (חשבוניות ו"✓ נבדק"). היא לא ב-HANDOVER ולא מסמנת חלקים. **גבייה:** `SUPERVISORS = CEO + ACCOUNTANT` (רואה את כל המסלקות, משייכת ומעדכנת כל תיק). עריכת הסכמי תשלום נשארת CEO בלבד (`canEditTerms`). יש לה שני הסניפים ב-`branch_ids`, כי זה נדרש ל-RLS של ההחזרות.
- **ש.י.ר = ריכוז חודשי (14/10, עמית; מיגרציה `20261014290000`):** כל חשבוניות החודש משולמות יחד, שוטף 60, ב-7 לחודש השלישי (יוני משולם ב-7/9), פחות קיזוזים ובלי חסומות. ב-`insurer_payment_terms` נוסף `basis`: APPROVAL (מתאריך אישור התשלום) או INVOICE (מחודש החשבונית = `case_closed_on`). ש.י.ר מוגדר כ-INVOICE, `offset_months=3`, `pay_day=7`. `expectedPayment` מטפל ב-INVOICE לפני כל דבר אחר. סטטוס חדש `BLOCKED` ("חסומה") ב-`collection_cases`. **קיזוז אפשר להקליד בכל שלב**, לא רק בתשלום חלקי (`offset_amount` + `partial_reason`; חובה רק ב-PARTIAL), והוא יורד מהסכום לגבייה (`netDue`, וגם ב-balance בדשבורד). לשונית "🧾 ש.י.ר — ריכוז חודשי" ב-`/collections` (`listShirBatch`, `setShirInvoice`, `markShirMonthPaid`): לכל חודש מוצגים מועד תשלום צפוי, חשבוניות, קיזוזים, חסומות, נטו וסטטוס. בפירוט אפשר להקליד קיזוז, סיבה וחסומה לכל חשבונית. "✓ החודש שולם" סוגר את כל מה שלא חסום (PAID, או PARTIAL אם יש קיזוז). פעולה על חשבונית בלי תיק גבייה פותחת תיק (`ensureCase`) שמשויך למשתמש. בדשבורד נוסף KPI "חשבוניות חסומות".
- **📊 דשבורד גבייה (`/receivables`, 14/10, עמית):** כל התמונה הכספית של הגבייה, למנכ"ל ולמי שהוא מאשר. הרשאות בטבלה `finance_viewers` (מיגרציה `20261014270000`): משתמש קורא רק את השורה שלו, והכתיבה דרך השרת, CEO בלבד, בפאנל "🔒 הרשאות צפייה" בתחתית הדשבורד. ה-layout בודק את השורה במקביל לשאילתת ההודעות, ומוסיף את הקישור. `actions/receivables.ts`: `getReceivables` (service role אחרי הבדיקה) ו-`setReceivablesViewer`. 8 חלקים: (1) תמונת מצב, (2) צפי תזרים (באיחור, 6 חודשים, ללא צפי), (3) גיול חובות, (4) נגבה בפועל ב-12 חודשים, (5) לפי חברת ביטוח, (6) סיבות קיזוז, (7) משפטי לפי עורך דין, (8) תפוקת מסלקות. בורר תקופה (חודש/רבעון/חציון/שנה/הכול) חל על נגבה, קיזוזים ותפוקה. "ממתין לפתיחת תיק" = שורות `finance_closures` בלי `collection_cases`, כולל היסטוריית האקסל. **"💰 כמה גבתה כל מסלקת"** (`CollectedByCollector`, עמית 14/10): רק `isManager` = CEO + ACCOUNTANT. הטבלה מראה לכל מסלקת את החודש, הרבעון, השנה ומאז ההתחלה, ומתחתיה רשת של 12 חודשים. הסכום = `received_amount` (PAID/PARTIAL) ועוד `legal_recovered_amount`, לפי תאריך הכניסה. גם עמודת "נגבה" בטבלת התפוקה מוסתרת ממי שאינו מנהל. ההסתרה היא ברמת התצוגה: הנתונים הגולמיים של התיקים מגיעים לכל מורשה הדשבורד. אם יאושר בעתיד צופה שאינו CEO או ACCOUNTANT, צריך לחשב בשרת. **במסך `/collections` נשארה רק העבודה התפעולית:** סיכומים כספיים, צפי חודשי, תפוקה, קיזוזים ועורכי דין עברו לכאן.
- **💳 גבייה = תיקי גבייה לפי מסלקת (14/10 ערב, עמית; מחליף את רשימת "פתוח"):** טבלה `collection_cases` (מיגרציה `20261014260000`, server-only). `finance_collections` הקודמת לא בשימוש. מסלקת לוחצת "📂 פתיחת תיק" ומקלידה מספר רכב, ו-`lookupPlateForCollection` שולף את הנתונים מ-`finance_closures` (שורה שכבר נלקחה מסומנת "כבר בטיפול של X"). מה שחסר מקלידים ידנית, ואפשר לפתוח תיק ידני בלי שורה במאגר. הנתונים נשמרים בתיק כעותק שאפשר לערוך. התיק משויך למי שפתחה אותו (`assigned_to`; CEO יכול לשייך למסלקת), אחד לכל שורת כספים (unique חלקי). מסלקת רואה רק את התיקים שלה. CEO רואה "כל המסלקות" או מסלקת אחת, עם טבלת תפוקה לכל מסלקת: בטיפול, נסגרו, נסגרו החודש, ממוצע ימי עבודה (א׳–ה׳, `workingDaysBetween`), באיחור, קיזוזים ומשפטי. סטטוסים: OPEN בטיפול / PAID / PARTIAL (חובה סיבה וסכום קיזוז) / DISPUTE / LEGAL (תאריך העברה, עורך דין, סכום תביעה, תאריך סיום, סכום ששולם בסוף). התיק נסגר (`closed_at`) ב-PAID, ב-PARTIAL, או ב-LEGAL כשיש תאריך סיום. עיכוב = ימים מעבר לצפי. ל-CEO יש גם טבלת סיבות קיזוז וטבלת עורכי דין (נתבע מול התקבל, באחוזים). נבדק ב-rollback: כפילות נחסמת, סטטוס שגוי נחסם, קיזוז נשמר.
- **💳 גבייה (`/collections`, 14/10, עמית, גרסה ראשונה; מנהלת החשבונות כותבת אפיון):** תפקיד חדש `COLLECTIONS` ("מסלקת תביעות"; מיגרציות `20261014230000` enum, `20261014230100` מודול). המשתמשות: ספיר מימון (sapir@), ליטל ביטון (l@), גלית וענונו (tviotto@). הן נוצרו **בלי סניפים** (`branch_ids=[]`), ולכן לפי RLS הן לא רואות תיקים, רכבים, הפניות או כספים (נבדק בהתחזות: 0 בכולם). בתפריט שלהן יש רק גבייה, הודעות והתראות, והבית שלהן הוא `/collections`. `actions/collections.ts` (COLLECTIONS + CEO) קורא דרך service role **רק** את השדות שעמית התיר: חשבונית לתשלום, צ׳ק תביעות בצד ג׳ (מועד וסכום), קיזוז מע"מ, כינון, ופרטי זיהוי (תאריך, סניף, רכב, לקוח, חברה, סוג, מספר חשבונית). עבודת הגבייה נשמרת ב-`finance_collections` (status OPEN/PARTIAL/PAID/DISPUTE, סכום ותאריך קבלה, הערה; server-only). הסכום לגבייה = חשבונית פחות קיזוז מע"מ פחות כינון (הנחה, ממתינה לאישור). **צפי כניסת כסף** (`src/lib/collections.ts` → `expectedPayment`, מיגרציה `20261014240000`): בפוליסה, בהסדר ג׳ ובכל סוג שאינו צד ג׳ = סוף החודש של `payment_approved_on` (תאריך אישור התשלום, המסלקות מזינות אותו) לפי ההסכם של המשלם ב-`insurer_payment_terms` (מיגרציה `20261014250000`, מתוך הדף של עמית "זמני תשלום חברות הביטוח בהסדר"): MONTHLY = `offset_months` חודשים אחרי חודש האישור, ביום `pay_day` (31 = סוף החודש), ועם `cutoff_day` (AIG: אישור אחרי ה-25 עובר חודש נוסף). BIWEEKLY = ב-15 או בסוף החודש (איילון). ש.י.ר = שוטף 60, כלומר סוף החודש השני. לאמדוקס, יוניון מוביליטי ואנקור אין עדיין הסכם. רק CEO עורך ומוסיף חברה, בפאנל "⚙️ הסכמי תשלום". `payDateByRule` נבדק מול כל הדוגמאות בדף. בצד ג׳ = מועד פירעון הצ׳ק (ואם אין, תאריך האישור). "באיחור" = הצפי עבר ולא שולם. "ממתין לאישור / הסכם" = אין עדיין צפי. "✓ שולם בפועל" סוגר את השורה לפי תאריך התשלום בפועל, והיא יורדת מהטבלאות הפתוחות. למעלה מוצג סיכום הצפי לפי חודש. בכרטיס הסגירה של אילנה נוספו `vat_offset`, `reinstatement`, `appraiser_fee` (שכר טרחת שמאי, רק בצד ג׳). בכרטיס, קיזוז מע"מ וכינון מוצגים כשאלת כן/לא (`YesNoAmount`), ושדה הסכום נפתח רק ב"כן" ("כן" בלי סכום חוסם את השמירה). "לא" או בלי תשובה נשמר כ-null (עמית 14/10).
- **כספים (`/finance`, 14/10, עמית):** טבלה `finance_closures` (שורה = תיק שנסגר + חשבונית; מיגרציה `20261014120000`). RLS: מנכ"ל פעיל בלבד (`is_active_ceo()`), וגם הדף מפנה כל מי שאינו CEO. `work_source`: DIRECT / SHIR / IDF. בשורות ש.י.ר `insurer` ריק, כי החברה לא ידועה לנו. `amount_ours` = כולל מע"מ ועם ההנחות (המדד הראשי), `amount_shir` = ללא הנחות. **ייבוא היסטורי:** האקסל של אילנה (241 שורות, אוג'–אוק' 2026), `source='EXCEL_IMPORT'` + `import_key` כדי שייבוא חוזר לא יכפיל. בייבוא הוסרו 10 כפילויות, תוקנו 15 תאריכים שאקסל הפך בהם יום וחודש, ו-`review_note` מסמן שורות לבירור. הסה"כ אומת מול האקסל לאגורה. הדשבורד (`FinanceClient.tsx`) מחשב בצד הלקוח: תקופה (חודש/רבעון/חציון/שנה), סניף, מקור; פילוח לפי מקור, סוג תביעה, חברת ביטוח, שמאי, סניף ושמאי×תביעה. עוד אין הזנה מתוך המערכת (שלב הבא: שדות סגירה של אילנה, כולל מספר חשבונית והשתתפות עצמית).
- **קריאת חשבוניות מהצילום (14/10, עמית):** `src/lib/invoiceReader.ts` (Haiku, tool `report_document`; אותו מפתח Vault כמו המדבקות, דרך `apiKey()` שמיוצא מ-`stickerReader.ts`) ו-`readSupplierDocPhoto` ב-`actions/supplierDocs.ts`. מיד אחרי הצילום, `NewDocForm` ממלא רק שדות ריקים: סוג המסמך, ספק, מספר החשבונית או התעודה (לא מספר הזמנה או הקצאה), רכב, סכום כולל מע"מ ותאריך. התאריך לא נדרס אם המשתמש שינה אותו. בטופס יש כותרות לכל שדה. **כרגע לא פעיל:** אין עדיין מפתח ב-Vault (נבדק 14/10), ולכן הטופס ידני כמו קודם.
- **🧾 חשבוניות / תעודות משלוח בתוך החזרות (14/10, עמית):** טבלה `supplier_documents` (מיגרציה `20261014160000`): סוג (INVOICE / DELIVERY_NOTE / CREDIT_INVOICE), ספק, מספר, תאריך, רכב, סכום, הערות ותמונה ב-bucket `part-returns` תחת `docs/`. RLS כמו מעקב ההחזרות (`can_track_part_returns()` + סניף). staff רק קוראים, והכתיבה דרך `actions/supplierDocs.ts` עם service role. **בדיקה כפולה:** "✓ נבדק" רק על ידי מי שלא צילם (נאכף גם ב-CHECK `verified_by <> created_by`). הלשונית `SupplierDocsTab.tsx` מקובצת לפי סניף וממוינת לפי תאריך, עם חיפוש. היא מציגה גם חשבוניות שצולמו בתוך החזרה (מקור או זיכוי). החיפוש הראשי של "החזרות" מחפש גם בה. פחחים לא רואים את הלשונית.
- **מנגנון נגד הקלדה כפולה (14/10, עמית):** (1) `saveFinanceEntry`: אם לאותו מספר רכב, או לאותו מספר חשבונית, כבר קיימת שורת כספים (מתיק אחר או מהאקסל), השמירה מחזירה `duplicates` ולא שומרת. בכרטיס מוצגת אזהרה עם האפשרויות "שני נזקים שונים, אני מאשר/ת, שמור" ו"הקלדה כפולה, בטל". האישור נשמר ב-`duplicate_confirmed_by/at`, ואחרי אישור עריכה של אותה שורה לא מזהירה שוב. (2) `createSupplierDoc`: אותו ספק עם אותו מספר מסמך (ilike) מחזיר אזהרה, והאישור נשמר ב-`duplicate_confirmed_at`. מיגרציה `20261014200000`. חברת הביטוח "יושור" שונתה ל-"ווישור" (עמית).
- **כל נתון עם שם (14/10, עמית: "לא להשאיר לאנשים דברים שהם צריכים לחשוב"):** בכרטיס החלק (`PartCard`) מופיע "חלק: / מק״ט: / כמות: / סיבה: / רכב: / סניף: / סומן להחזרה ע״י: / בתאריך: / ממתין לאיסוף: / תאריך על המדבקה:", וגם "נמסר לנהג: / ממתין לזיכוי:" ו-"זוכה בתאריך: / מספר חשבונית זיכוי: / סכום הזיכוי:". **זה הכלל לכל מסך חדש:** לא מציגים מספר או ערך בלי כותרת, **וכל נתון בשורה משלו, מלמעלה למטה** (עמית: "למעלה למטה ברורה ולא אחד אחרי השני"). הרכיבים `Fields` / `Field` ב-`ReturnsClient.tsx` (dl בשתי עמודות: כותרת ואז ערך) משמשים בכרטיס החלק, במסירה לנהג ובזיכוי.
- **חשבונית בהחזרה = קישור, לא צילום (14/10, עמית):** בטופס ההחזרה של המחסנאי וגם בכרטיסים כבר אין צילום חשבונית מקור, כי החשבונית מצולמת מראש בלשונית "חשבוניות / ת. משלוח". נשאר רק שדה מספר החשבונית (`document_number`), שמתמלא מהמדבקה. `CreditsInvoice` מציג בטבלה ובכרטיס "🔗 מזכה חשבונית X", ואם החשבונית צולמה בארכיון (`makeInvoiceLookup`: התאמה בלי רווחים ואותיות גדולות/קטנות, וגם מספר מדבקה עם סיומת שורה כמו "HZM2769725-01") לחיצה פותחת אותה. אחרת מוצג "לא צולמה". זיכוי וצילום חשבונית זיכוי לא השתנו.
- **חתימת הנהג במסירה (14/10, עמית):** "🚚 נמסר לנהג" פותח חלון חתימה (`src/components/SignaturePad.tsx`, canvas שמחזיר PNG). המסירה לא נשמרת בלי חתימה. `handOverToDriver(ids, driver, signaturePng)` שומר PNG אחד לכל מסירה ב-`part-returns/signatures/…` (bucket פרטי), ושומר אותו ב-`driver_signature_path` של כל החלקים שנמסרו יחד (מיגרציה `20261014190000`). אם אף שורה לא עודכנה, הקובץ נמחק. החתימה מוצגת (`SignatureThumb`) ב"ממתין לזיכוי" ובטבלה. **איך מגיעים לחתימה (תוקן 14/10, עמית לא מצא אותה):** בלשונית "ממתין לאיסוף" יש באנר "🚚 מסירה לנהג והחתמה" עם 4 שלבים, ובכל כרטיס כפתור "🚚 מסירה לנהג + חתימה" שבוחר את הספק ואת החלק. בחירת ספק מסמנת את כל החלקים שלו. הכפתור הראשי נקרא "✍️ החתמת נהג ומסירה", וכשהוא חסום מוצג מה חסר. רק מי שב-HANDOVER_ROLES רואה את הכפתורים.
- **פחחים בהחזרות (14/10, עמית):** PAINTER נוסף ל-`PART_RETURNS_ROLES`. פחח מסמן חלק להחזרה (כבר היה ב-MARK_ROLES ובמדיניות ה-insert), ולפי RLS רואה רק מה שהוא סימן (נבדק בהתחזות: רואה 1, של אחרים 0). אין לו מסירה, זיכוי או לשונית חשבוניות. הקישור "החזרות" כבר היה בתפריט שלו, מוסתר דרך `canUsePartReturns`.
- **החזרות, פיילוט (13/10, תומר):** `PART_RETURNS_ROLES = [CEO, WAREHOUSE, WAREHOUSE_MANAGER]` ב-`src/lib/partReturns.ts` (במקום CEO_ONLY). משתמשים: רועי `roy@toyota-tehila.co.il` (WAREHOUSE_MANAGER, שני הסניפים) ולירון (WAREHOUSE). התראת "חלק חדש להחזרה" למחסנאים פעילה. פחחים ויועצים מצטרפים כשעמית יאשר: מוסיפים את התפקידים לרשימה.
- **מדידת מהירות, זמני (13/10):** `src/components/PerfBeacon.tsx` (ב-dashboard layout) שולח ל-`/api/perf` דגימות מסוג load/nav/bell (תפקיד + נתיב מנורמל + זמנים, בלי מידע אישי) לטבלה `public.perf_samples` (מיגרציה `20261013140000`, service בלבד). הפעמון שולח `perf:bell`. בסיום החקירה: להסיר את הרכיב, את הנתיב ואת הטבלה.
- **הפעמון מהיר יותר (14/10):** המדידה מצאה שטעינת הפעמון לוקחת כ-1.4 שניות בחציון (פחחים 2.2, ובאחוזון ה-90 עד 4.3), ושהיא חוזרת שוב ושוב: כ-2,000 טעינות ב-11 שעות אצל 3 משתמשי משרד. טעינת דף תקינה (TTFB כ-75ms). התיקון ב-`NotificationsBell.tsx`: 4 השאילתות הבלתי-תלויות רצות במקביל ואחריהן 2 התלויות (במקום 5 ברצף). `loadRows` מריץ טעינה אחת בכל פעם, ובקשה שמגיעה בזמן טעינה רצה פעם אחת אחריה. ה-poll של 20 שניות רץ רק כשהמסך גלוי. הלוגיקה של מה מוצג לא השתנתה.
- **צילום מרובה לפני העלאה (13/10, עמית):** `src/components/CameraBatchUpload.tsx`: כל צילום נכנס למגש תמונות ממוזערות עם ✕, ואז "📷 עוד תמונה" או "⬆️ העלה הכל (N)" דרך פונקציית ההעלאה הקיימת של המסך. מחובר ל"צלם" במסמכי התיק, בתיק הפחח ובמסמכי הסגירה. טפסים שכבר צוברים קבצים (פתיחת תיק, הפניה, בקשת פחח, תוספת) לא שונו.
- **מיילים = `src/lib/mailer.ts` בלבד (13/10, תומר: אפשרות ב).** `sendMail()` שולח דרך Microsoft 365 (Graph sendMail) מתיבת `Report@toyota-tehila.co.il` (נשמר ב"נשלחו") **כאשר** `MS_TENANT_ID` / `MS_CLIENT_ID` / `MS_CLIENT_SECRET` מוגדרים ב-Vercel (אופציונלי `MAIL_SENDER`); אחרת דרך Resend בדיוק כמו קודם. `onceKey` (הדוח היומי): ב-Resend הוא Idempotency-Key, וב-Graph הוא claim ב-`public.sent_emails` (מיגרציה `20261013130000`, RLS בלי policies, service בלבד), שמשתחרר בכשל. אפליקציית Entra עם Mail.Send מוגבלת לתיבה אחת (ApplicationAccessPolicy). אין לקרוא ל-api.resend.com מחוץ ל-mailer.
- **הערות על כרטיס התיק (13/10, עמית):** `cases.notes` מוצג ב-CaseRow/CompactCaseRow בתיבה צהבהבה של עד 2 שורות (`cardNote()` ב-`src/lib/cardNote.ts` מסיר את הכותרת "⚠️ הערות חשובות מההפנייה:"; הטקסט המלא ב-title). אפשר גם לחפש בהערות.
- **חיפוש בכל רשימות התיקים (2026-10-13, עמית):** אותה תיבה (`SearchField`) ואותו כלל (`matchesCaseQuery` ב-`src/lib/caseQuery.ts`; מספר רכב עם מקפים עדיין מוצא את הספרות) ברשימת התיקים, בלוח הפחחים, בסגירה ובהפניות.
- **חיפוש ברשימת התיקים (2026-10-13):** ליד הכותרת "תיקים". קודם הוא ישב ליד שורת הסניפים, וה-`w-full` שלה דחס אותו לרוחב 0.
- **סוג רכב ליד מספר הרכב (2026-10-13, עמית):** `shortVehicle()` ב-`src/lib/vehicleLabel.ts` מקצר את נוסח משרד התחבורה ("טויוטה טורקיה C-HR HYBRID" → "טויוטה C-HR HYBRID"). מוצג ברשימת התיקים (CaseRow / CompactCaseRow, וגם בחיפוש של הרשימה), במסך ההתראות (כותרת קבוצה + כל שורה), בפעמון, בחיפוש 🔍 ובלוח הפחחים.
- **CEO notification diet (2026-10-12, Amit approved; migration `20261012180000_ceo_notification_tiers.sql`).** `ceo_notification_tier(type,title)` → `ACTION` (approvals, DIRECT_NOTE, PART_RETURN_OVERDUE_14: bell + push) / `INFO` (bell only, **no push**) / `DROP` (painter reminders, parts arrived, painter-request answers, wheels forms, estimate approved, WASH_STARTED, other people's BLOCKED_ACTION: not stored for the CEO — they are in the 18:00 report). Enforced in `drop_irrelevant_notification()` and `dispatch_ceo_push()`; other roles unchanged. The bell folds the CEO's "עדכונים שוטפים" **one row per car** (`groupByCase` in `NotificationsBell.tsx`, `markManyRead`), badge = cars with news + unread actions. Before: ~145/day for Amit, ~5 needed him.
- **New notification?** Give it a distinct `type` (or a title the `notification_kind` CASE recognises) and add it to the rule. A title the CASE doesn't know falls into `CASE_FLOW` (advisors + CEO).
- Kinds are partly recognised by **title text** (many rows are type `OTHER`) — renaming a title in code can move it to another kind. Prefer adding a real type.

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

---

### 🔴 Standing Rule #4: Comprehensive QA Testing (2026-09-14)

**Policy:** QA agents MUST test both happy-path AND sad-path scenarios. Happy-path only is a critical failure.

**Root Cause:** On 2026-09-14, 4 critical bugs shipped to production because QA only tested "does it work for valid users?" Never asked "does it correctly reject invalid users?"

**Bugs QA Missed:**
1. ❌ Multi-branch selector not showing (only tested CEO scenario)
2. ❌ File uploads failing (no file upload tests at all)
3. ❌ Storage RLS path extraction wrong (no RLS validation tests)
4. ❌ SERVICE_ADVISOR creating cases (no permission enforcement tests)

**Mandatory QA Test Categories:**

| Category | What to Test | Why QA Missed It |
|----------|-------------|-----------------|
| **Happy Path** | Does it work for valid users? | Tested ✅ |
| **Sad Path** | Does it reject invalid users? | ❌ Never tested |
| **File Uploads** | Can users upload files in all flows? | ❌ Zero file upload tests |
| **Multi-Branch** | Do OFFICE/SERVICE_MANAGER with 2+ branches work? | ❌ Only tested CEO/0-branches |
| **RLS Policies** | Do database policies enforce correctly? | ❌ No RLS validation tests |
| **Permission Enforcement** | Does each role see/do only what they should? | ❌ Only tested allowed roles |
| **Cross-File Patterns** | If bug in file A, does it appear in B-Z? | ❌ No pattern detection |

**Mandatory Checklist Before Any Production Deployment:**

```
✅ 1. File Upload Tests
  - [ ] Each role that can upload: test full flow (create + upload + success)
  - [ ] Verify file stored in bucket
  - [ ] Verify document record created in database
  
✅ 2. Multi-Branch Tests  
  - [ ] OFFICE with 1 branch: NO picker (defaults)
  - [ ] OFFICE with 2+ branches: YES picker
  - [ ] SERVICE_MANAGER with 2+ branches: YES picker
  - [ ] Can switch branches and see/create correct branch's data
  
✅ 3. Permission Enforcement (Sad Path)
  - [ ] SERVICE_ADVISOR: CANNOT see/create cases
  - [ ] OFFICE: CANNOT create cases (referrals only)
  - [ ] PAINTER: CANNOT see cases page at all
  - [ ] Each role blocked correctly (not just missing button)
  
✅ 4. RLS Policy Validation
  - [ ] Storage file upload succeeds for authorized user
  - [ ] Storage file upload fails for unauthorized user
  - [ ] RLS policy errors are clear (not "Profile not found")
  
✅ 5. Column/Schema Consistency
  - [ ] All `.select()` statements use correct column names
  - [ ] If schema has `branch_ids`, code uses `branch_ids` (not `branch_id`)
  - [ ] No NULL errors from missing columns
  
✅ 6. Pattern Detection
  - [ ] If bug found in Server Action A, grep for same pattern in B-Z
  - [ ] If typo in column name, check all similar operations
  - [ ] If RLS policy issue, validate all similar policies
```

**Why This Rule Exists:**

Before (2026-09-13): QA agents were test-and-hope. They only checked "happy path" scenarios and missed critical sad-path failures.

After (2026-09-14): QA agents MUST validate that the system correctly handles BOTH valid AND invalid scenarios. A system that works for valid users but doesn't reject invalid ones is broken.

**Related files:**
- `QA-TEST-GAPS-2026-09-14.md` — Detailed post-mortem on all 4 missed bugs
- `.claude/agents/qa-master-tester.md` — Updated with new test cases
- `DEPLOYMENT_CHECKLIST.md` — Updated with QA checklist


---

### 🔴 Standing Rule #5: Permissions Live in the Matrix, Never in Code (2026-09-18)

**Policy:** `role_permissions` is the single source of truth for who may do what.
Never hard-code a role list for one of the nine governed actions.

**Root Cause:** The Settings permission screen was display-only for months. It
rendered switches, the CEO flipped them, rows were saved — and nothing consulted
them. Worse, the matrix showed SERVICE_ADVISOR as able to create cases and manage
extras, which the code had always refused, so the CEO was reading a false picture.
Separately, opening a referral was hard-coded to OFFICE/CEO and absent from the
matrix entirely, so the reported "נסיה and ערן cannot open referrals" had no fix
short of a code change.

**The ten governed actions:**

| action | Hebrew label | Default roles |
|---|---|---|
| `create_case` | פתיחת תיק | SERVICE_MANAGER, OFFICE, CEO |
| `create_referral` | פתיחת הפנייה | OFFICE, CEO |
| `complete_professional_step` | השלמת שלב מקצועי | SERVICE_MANAGER, SERVICE_ADVISOR, CEO |
| `complete_closure_step` | השלמת שלב סגירה | OFFICE, CEO |
| `decide_approvals` | אישור בקשות | CEO |
| `upload_documents` | העלאת מסמכים | SERVICE_MANAGER, SERVICE_ADVISOR, OFFICE, CEO |
| `delete_documents` | מחיקת מסמכים | SERVICE_MANAGER, OFFICE, CEO |
| `manage_extras_status` | ניהול תוספות | SERVICE_MANAGER, CEO |
| `manage_settings` | ניהול הגדרות | CEO |
| `delete_cases` | מחיקת תיקים | CEO (שאר התפקידים כבויים — עמית מדליק בהגדרות; נוסף 2026-10-07) |

**How to check a permission:**

```ts
import { hasPermission } from '@/lib/permissions';
if (!(await hasPermission(supabase, 'create_case'))) return { error: '...' };
```

```sql
-- in RLS, ALWAYS AND-ed with the branch check, never replacing it
WITH CHECK (has_permission('create_case') AND (get_my_role() = 'CEO' OR branch_id = ANY(get_my_branch_ids())))
```

**Four invariants that must never be broken:**

1. **CEO is never gated.** `has_permission()` returns true for CEO before reading
   the table, and `updateRolePermission()` refuses to edit CEO rows. No setting
   can lock the owner out of their own system.
2. **Branch isolation stays hard-coded.** The matrix decides WHICH ROLES; it must
   never decide WHICH BRANCHES. Always AND the branch check alongside it.
3. **Fail closed.** `hasPermission()` returns false on RPC error, and unknown
   role/action pairs deny. A permission check that cannot run must block.
4. **Grant a permission everywhere or nowhere.** A half-granted permission is
   worse than none — the user gets a confusing mid-flow rejection. When adding an
   action, wire ALL of: the server action, its RLS policy, dependent tables, any
   storage helper, AND the UI gate that shows the button.

**Adding a new action — the full checklist:**

- [ ] Insert 5 rows (one per role) into `role_permissions` via migration
- [ ] Add to `PermissionAction` union in `src/lib/permissions.ts`
- [ ] Add Hebrew label to `ACTION_LABELS` in `settings/PermissionsTab.tsx`
- [ ] Gate the server action with `hasPermission(...)`
- [ ] Update the RLS policy (AND-ed with branch check)
- [ ] Update dependent tables' policies and any `_storage_*` helper
- [ ] Update the UI gate so the button/page matches what the server allows
- [ ] Verify: `npx tsc --noEmit`, `npm run build`, re-query the policies in prod

**Known deliberate exceptions (not in the matrix):**

- **User account management** (`users.ts`) — CEO only, not delegatable.
- **Painter requests** (`painter.ts`) — PAINTER creates; SERVICE_MANAGER /
  SERVICE_ADVISOR / CEO respond. Advisors were locked out of `/painters` until
  2026-09-18 despite being the ones notified; keep those roles in sync.
- **`_storage_user_can_see_case()`** — branch-only on purpose. It backs read,
  upload AND delete, so gating it on `upload_documents` would also block viewing.
- **Deleting your own upload** — always allowed, outside the matrix.

**Warning to relay when delegating:** `manage_settings` is effectively an admin
grant. Whoever holds it can edit the matrix and thereby grant themselves the
other eight. It cannot touch CEO rows or lock the CEO out.

---

### 🔴 Standing Rule #6: Verify RLS by Impersonating, Never by Reasoning (2026-09-18)

**Policy:** Never claim an RLS-protected flow works without executing it under
that user's identity. Reading the policy and concluding it "should pass" is not
verification — and neither is calling a helper as admin.

**Root Cause:** During the upload incident, `_storage_user_can_see_referral()`
was called directly from an admin session and returned `false`. That was
reported as "the function is broken" when in fact `auth.uid()` is simply NULL
outside a user session, so the JOIN matched nothing. Later, a "100% certain"
check was run against `ilana@tehila.test` — a **disabled test account** — while
the real user is `reception@toyota-tehila.co.il`. Both conclusions were wrong,
and both were delivered with confidence.

**How to actually test.** Postgres resolves `auth.uid()` from the JWT claim, so
set it and run the real statement inside a transaction you roll back:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';

-- Then run the ACTUAL operation, not a helper function:
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('referral-documents','<referral-id>/probe.pdf','<user-uuid>','{"size":1}'::jsonb);

ROLLBACK;  -- always; this must never persist
```

If it inserts, the user can upload. If RLS rejects it, they cannot. No inference.

**Rules:**

1. **Test the operation, not the helper.** A helper returning true does not mean
   the policy passes — the policy may AND several conditions together.
2. **Test every layer.** A file upload crosses three: the server action's
   `hasPermission`, `storage.objects` RLS, and the metadata table's RLS. All
   three must pass; verify all three.
3. **Confirm the row first.** Check the email against `auth.users` and that
   `is_active` is true before trusting any result. Duplicate and disabled
   accounts exist in this database.
4. **Test the sad path too.** Confirm the roles that should be blocked ARE
   blocked. A policy that allows everyone also "passes" the happy-path test.
5. **Always ROLLBACK.** These probes run against production.

**Verified upload matrix (2026-09-20), produced with the method above.**
There are FOUR buckets — testing only two is how the painter buckets stayed
broken for days after the others were fixed:

| Role | referral-documents | case-documents | painter-images | extras-images |
|---|---|---|---|---|
| CEO | ✅ | ✅ | ✅ | ✅ |
| OFFICE | ✅ | ✅ | ✅ | ✅ |
| SERVICE_MANAGER | 🚫 | ✅ | ✅ | ✅ |
| SERVICE_ADVISOR | 🚫 | ✅ | ✅ | ✅ |
| PAINTER | 🚫 | 🚫 | ✅ | ✅ |

**Two different gates, on purpose.** `case-documents` is formal paperwork and
requires `upload_documents`; `painter-images` / `extras-images` are photos of
the work and require only case/branch access — a PAINTER has
`upload_documents = false` yet must obviously be able to photograph the car.

**Use the right parent id per bucket when probing:** `referral-documents` is
keyed by `referral_id`, the other three by `case_id`. Passing a case id to the
referral bucket returns BLOCK and looks exactly like a permissions bug.

Re-run this matrix after any change to a storage policy, a `_storage_*` helper,
or the permission matrix.

---

### 🔴 Standing Rule #7: Push to the Remote That Actually Deploys (2026-09-25)

**Policy:** This repo has TWO remotes. Only one is connected to Vercel. After
every push, verify the deploy remote received it.

```bash
./scripts/check-deploy-remote.sh
```

| remote | URL | deploys? |
|---|---|---|
| `origin` | `github.com/sasha463111/amit-maymon-new` | ❌ no |
| `tomer` | `github.com/tdavidyan85/amit-maymon-new` | ✅ **production** |

`main` tracks `origin`, so a plain `git push` goes to the remote that deploys
**nothing** — and reports success. There is no error, no warning, and the
commit really is pushed. It is simply pushed somewhere Vercel never sees.

**Root Cause:** On 2026-09-25 this was found after **20 commits** had
accumulated. Production had been serving code from 17.09 for over a week while
database migrations were being applied live — so production was running OLD
CODE against a NEW SCHEMA. That is worse than being merely out of date: the
permission matrix, the notification fix and the RLS changes were live in the
database while the code that understood them was not deployed.

It went unnoticed because every signal said success: `git push` reported the
commit, the build passed, and database changes took effect immediately (they
are applied directly, not through Vercel), so parts of the system genuinely did
improve.

**Rules:**

1. **Push to both.** `git remote set-url --add --push origin <both URLs>` makes
   one push reach both. This is LOCAL config — it does not travel with the
   repo, so re-apply it on any new machine.
2. **Verify, don't assume.** Run the script above after pushing. "git push
   succeeded" does not mean "deployed".
3. **Suspect this first** when production behaves like an older build, or when
   a database change works but the matching UI change doesn't.
4. **Never conclude a fix is live** from a successful push alone — the only
   proof is the deploy remote's HEAD matching local, or a Ready deployment in
   Vercel.

**Why two remotes exist:** not established. Do not delete either without
checking with the owner — `origin` may be a collaborator's fork.
