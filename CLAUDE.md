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
| **Vercel** | — | Hosting, region: `iad1` (ראה סעיף 17 — הועבר מ-fra1, אל תחזיר) |

**Supabase Project URL:** `https://yhanmyvolpeiuxspcxmk.supabase.co`

---

## 3. מבנה תיקיות

```
src/
  app/
    (dashboard)/          # כל הדפים המוגנים (אחרי login)
      layout.tsx          # Header + navigation per role
      cases/               # רשימת תיקים + יצירת תיק
        [id]/              # פרטי תיק (CaseDetailClientV2.tsx)
          PainterRequestsSection.tsx  # בקשות פחח מוצגות בתוך התיק
      approvals/           # אישורי CEO
      closure/             # סגירת תיקים (OFFICE + CEO), טאבים לפי סניף
        [id]/
      extras/              # תוספות פחחות — /new (PAINTER יוצר), /mine (הרשימה שלו), עמוד ראשי (SERVICE_MANAGER/CEO מנהלים, עם טאבים לפי סטטוס)
      referrals/           # הפניות טרום-תיק (OFFICE + CEO)
        [id]/
      notifications/       # התראות
      painters/            # לוח פחח (CEO + PAINTER + SERVICE_MANAGER)
        [id]/              # עמוד פחח נפרד לתיק
      settings/            # הגדרות (CEO בלבד)
      go/[id]/             # ניתוב role-neutral להתראות (ראה סעיף 11)
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
      push.ts              # Web Push: sendPushToUser, pushToOverseers
      vehicleLookup.ts     # שליפת סוג/שנת רכב ממשרד התחבורה לפי לוחית
      reports.ts           # דוח סיכום יומי (Resend), CEO-only
      auth.ts              # login/logout
    api/cron/
      enter-work-reminders/route.ts  # 4 סבבי תזכורות — ראה סעיף 11
    login/
  lib/
    supabase/
      client.ts            # Browser client
      server.ts             # Server client (cookies)
    recipients.ts           # branchRecipients() — helper לשליפת נמענים בסניף
  types/
    database.ts             # כל ה-types, enums, interfaces
  db/
    migrations/             # SQL migrations 001–046 — היסטוריה קפואה (ראה סעיף 16). מיגרציות חדשות: supabase/migrations/
supabase/
  config.toml              # הגדרות ה-Supabase CLI (major_version=17, ports 54321-54324)
  migrations/              # מיגרציות CLI עם timestamp — baseline: 20260901180001_remote_schema.sql (ראה סעיף 22)
  _archive/                # remote_history_pre_rebaseline_2026-09-01.sql — 20 רשומות ההיסטוריה מלפני ה-re-baseline
```

---

## 4. תפקידים (Roles)

| Role | שם | גישה | מה הם עושים |
|------|----|------|-------------|
| `SERVICE_MANAGER` | ערן | סניף שלו (array) | מנהל workflow מקצועי: FixCar, אומדן, שמאי, כניסה לעבודה, QC, שטיפה; גם עונה על בקשות פחח (בתיק וב-`/painters/[id]`) |
| `OFFICE` | אילנה, אביה | **1+ סניפים** (multi-branch) | סגירה אדמיניסטרטיבית: מסמכים, פרופורמה, טפסי סגירה; ניהול הפניות; **עכשיו יכולות לעבוד עם שני סניפים (נתיבות + אשקלון) — טאבים בכל דף רשימה** |
| `CEO` | עמית | **כל הסניפים** | אישורים + גישה לכל + מחיקת תיקים + הגדרות; מקבל **כל** התראה במערכת כולל על פעולות שהוא עצמו ביצע (מיגרציה 041 — עובד כפיד מעקב מלא) |
| `PAINTER` | ארז | סניף שלו | צ'קליסט פחח (נכנס לעבודה, חלקים), בקשות תוספות, תוספות פחחות |
| `SERVICE_ADVISOR` | כנרת | סניף שלה, או כל הסניפים אם `sees_all_branches=true` | צפייה בלבד + יועצת פחח (מקבלת התראות) |

**CEO אינו מגביל branch** — `branch_ids = []` בפרופיל שלו (ריק = כל הסניפים).
**OFFICE staff עכשיו multi-branch** — `branch_ids` array (מיגרציה 046: `branch_id` → `branch_ids[]`)

**יועצי פחח (`is_bodywork_advisor = true`):** SERVICE_MANAGER + SERVICE_ADVISOR — מקבלים התראות על WASH ועל בקשות מהפחח, ומוצגים ברשימה בבקרת איכות.

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
| 2 | `WHEELS_CHECK` | טפסי גלגלים | SKIPPED אוטומטית אם גיל רכב ≤ 2 שנים; קישור או קובץ; **אין** אישור CEO חוסם (הוסר 044) — רק התראת FYI לעמית בסיום |
| 3 | `PREP_ESTIMATE` | אומדן | אופציה להעלות קובץ אומדן |
| 4 | `SEND_TO_APPRAISER` | שליחה לשמאי | — |
| 5 | `WAIT_APPRAISER_APPROVAL` | המתנה לאישור שמאי | `requires_ceo_approval = true` |
| 6 | `ENTER_WORK` | כניסה לעבודה | אזהרה אם `parts_status ≠ AVAILABLE`; תזכורת אוטומטית אם לא סומן כנכנס לעבודה (ראה סעיף 11) |
| 7 | `ISSUE_CATALOG_NUMBERS` | ניפוק מק"טים | — |
| 8 | `PARTS_DISCOUNTS` | הנחות חלקים ועבודות | — |
| 9 | `QUALITY_CONTROL` | בקרת איכות | popup לבחירת יועץ מ-`bodywork_advisors` |
| 10 | `WASH` | שטיפה | בסיום → התראה ליועצי פחח |
| 11 | `SEND_COMPLETION_PHOTOS` | שליחת תמונות לשמאי גמר | — |
| 12 | `READY_FOR_OFFICE` | מוכן למשרד | בסיום → התראה ל-OFFICE בסניף + פתיחת closure workflow אוטומטית; תזכורת אוטומטית אם לא נפתח תוך שעה (ראה סעיף 11) |

**חסימות:**
- `READY_FOR_OFFICE`: חסום אם יש extras IN_TREATMENT, או אישורי CEO חסרים/נדחו
- `CLOSE_CASE` (שלב הסגירה): **אין** חסימת אישור נפרדת משלו (הוסרה ב-Session 6) — רק בדיקה משותפת שאין extras ב-IN_TREATMENT. אישור `ESTIMATE_AND_DETAILS` כבר נדרש קודם לכן, ב-`SEND_COMPLETION_PHOTOS`/`READY_FOR_OFFICE` שב-workflow המקצועי — לא כאן

---

## 7. Workflow סגירה (4 שלבים)

| # | step_key | שם עברי |
|---|----------|---------|
| 0 | `CLOSURE_VERIFY_DETAILS_DOCS` | אימות מסמכים ופרטים |
| 1 | `CLOSURE_PROFORMA_IF_NEEDED` | פרופורמה אם נדרש |
| 2 | `CLOSURE_PREPARE_CLOSING_FORMS` | הכנת טפסי סגירה |
| 3 | `CLOSE_CASE` | סגירה סופית |

**פותח אוטומטית** כשמשלימים `READY_FOR_OFFICE` ב-workflow המקצועי.

ה-`CASE_CLOSURE` approval בוטל. אישור CEO היחיד הוא `ESTIMATE_AND_DETAILS` (אמצע ה-workflow המקצועי). OFFICE יכול לסגור תיק ישירות ללא אישור נוסף.

**עמוד `/closure`** מציג רק תיקים עם `deleted_at IS NULL` ו-workflow מקצועי COMPLETED; ל-CEO יש טאבים לסינון לפי סניף (הכל/נתיבות/אשקלון), אותו קומפוננט (`SegmentedControl`) כמו ב-`/cases`.

---

## 8. DB Schema — טבלאות עיקריות

### `cases` — תיק תיקון
| עמודה | סוג | הערות |
|-------|-----|-------|
| `id` | uuid PK | |
| `branch_id` | uuid FK→branches | |
| `car_id` | uuid FK→cars | |
| `case_key` | text | `{plate}-{claim\|\|PRIVATE}` |
| `general_status` | enum | NEW/IN_PROGRESS/COMPLETED |
| `parts_status` | enum | NO_PARTS/ORDERED/AVAILABLE/AIRMAIL_PENDING |
| `customer_name` | text | |
| `phone` | text | |
| `insurance_company` | text | |
| `appraiser_name` | text | |
| `event_date` | date | |
| `sub_claim_type` | enum | POLICY/THIRD_PARTY/MILITARY/OTHER (037 הוסיפה MILITARY/OTHER) |
| `insurance_type` | enum | COMPREHENSIVE/THIRD_PARTY/PRIVATE/OTHER |
| `claim_type` | enum | PRIVATE/ACCIDENT/FLOOD |
| `fixcar_link` | text | |
| `wheels_check_link` | text | |
| `painter_status` | text | IN_WORK/WAITING_PARTS/PARTS_ARRIVED/READY_FOR_RELEASE/OTHER (034 הוסיפה OTHER + `painter_status_other_text`) |
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
| `deleted_at` / `deleted_by` | timestamptz / uuid | **Soft delete** — null = פעיל. **כל שאילתת SELECT על cases חייבת לסנן `deleted_at IS NULL`** — נשכח בעבר ב-`/closure` וב-`/extras/new`, תוקן |
| `enter_work_checklist_state` | jsonb | items שסומנו ב-ENTER_WORK |
| `catalog_numbers_assignee` / `parts_discounts_assignee` / `completion_photos_assignee` | text | מי ביצע כל שלב |
| `painter_reminder_sent_at` / `office_reminder_sent_at` | timestamptz | (035/038) שער חד-פעמי לתזכורות האוטומטיות — ראה סעיף 11 |

### `profiles` — משתמשים
| עמודה | סוג | הערות |
|-------|-----|-------|
| `id` | uuid = auth.uid() | |
| `full_name` | text | |
| `role` | enum user_role | |
| `branch_ids` | uuid[] | **Multi-branch support (046):** array of branch UUIDs. Empty [] = CEO (כל הסניפים). SERVICE_MANAGER/OFFICE/PAINTER: 1+ סניף. OFFICE staff עכשיו יכולות להיות 2+ סניפים (אילנה, אביה עם נתיבות + אשקלון) |
| `is_active` | bool | |
| `is_bodywork_advisor` | bool | האם מקבל התראות פחח + ברשימת QC |
| `sees_all_branches` | bool | (028) לרוב ל-SERVICE_ADVISOR — רואה את כל הסניפים בלי להיות CEO |

### `cars`
- `license_plate`, `make`, `model`, `year`, `vin`, `vehicle_type`, `first_registration_date`
- ⚠️ **פתיחת תיק ממלאת רק `vehicle_type`** (תוצאת שליפת משרד התחבורה, למשל "טויוטה קורולה") — `make`/`model` נשארים כמעט תמיד ריקים בפועל, כי אין להם שדה נפרד בטופס יצירת תיק. כרטיס/כרטיסייה שמציג פרטי רכב (`PaintersBoard.tsx`, `ClosureCasesGrid.tsx`) צריך להעדיף `vehicle_type` ולהשתמש ב-`make`+`model` רק כ-fallback — נמצא ותוקן כ-bug אמיתי (2026-08-31): הכרטיסים הציגו כלום כמעט תמיד.

### `case_workflow_runs`
- `case_id`, `workflow_type` (PROFESSIONAL/CLOSURE), `status` (ACTIVE/COMPLETED)

### `case_workflow_steps`
- `run_id`, `step_key`, `state` (PENDING/ACTIVE/DONE/SKIPPED), `order_index`, `completed_by`, `completed_at`

### `ceo_approvals`
- `case_id`, `approval_type` (ESTIMATE_AND_DETAILS/WHEELS_CHECK/CASE_CLOSURE — enum עדיין כולל את כל השלושה, אבל **רק ESTIMATE_AND_DETAILS עדיין בשימוש בפועל**: CASE_CLOSURE הוסר ב-Session 6, WHEELS_CHECK הוסר במיגרציה 044 — עמית ביקש שלא יידרש אישור, רק התראה), `status` (PENDING/APPROVED/REJECTED), `rejection_note`
- unique index על `(case_id, approval_type)` (020)

### `bodywork_extras`
- `case_id`, `description`, `image_path`, `status` (IN_TREATMENT/REJECTED/DONE), `created_by`

### `notifications`
- `user_id`, `case_id` (nullable — ריק להתראות שלא קשורות לתיק, כמו תזכורת הפניה), `type`, `title`, `body`, `read`, `triggered_by`, `action_url`
- **fan-out (031/032/041):** כל INSERT מפעיל טריגר `fanout_notifications_to_ceos()` שמשכפל את ההתראה לכל CEO פעיל ולכל SERVICE_ADVISOR עם `sees_all_branches=true`. עד מיגרציה 041 הפועל (`triggered_by`) היה מוחרג מהעותק שלו; **מ-041 CEO לא מוחרג** — רואה גם התראות על פעולות שהוא עצמו ביצע. יועצים חוצי-סניף עדיין מוחרגים מפעולות שהם עצמם ביצעו. dedup: 10 שניות לפי `(user_id, case_id, type, title, triggered_by)`.
- **push מקביל:** `pushToOverseers()` (`push.ts`) שולח web push לאותה קבוצה, עם אותו יוצא-מן-הכלל ל-CEO.
- **action_url + ניתוב:** התראות "אישית" (`/approvals?highlight=`) הולכות ישר. התראות "לפי תיק" (`/cases/...` או `/painters/...`) עוברות דרך `/go/[caseId]?<querystring>` (`src/app/go/[id]/page.tsx`), שמנתב כל role לעמוד שהוא כן יכול לפתוח (PAINTER → `/painters/[id]`, כולם אחרים → `/cases/[id]`) ומעביר הלאה כל query string (למשל `?highlight=<painter_request id>`). **PainterRequestsSection** (בתוך `/cases/[id]`) קולט את אותו `?highlight=` בדיוק כמו `PainterCaseClient` (בתוך `/painters/[id]`) — שניהם גוללים ומדגישים את הבקשה הספציפית.

### `push_subscriptions` (021/022)
- `user_id`, `endpoint`, `p256dh`, `auth`, `user_agent`, `last_used_at` — Web Push API subscriptions. RLS: `user_id = auth.uid() OR CEO`; קריאה עם service-role client כשהפועל אינו הנמען (ראה תיעוד ב-`push.ts`).

### `audit_events`
- `entity_type` (CASE/WORKFLOW_STEP/APPROVAL/EXTRA), `entity_id`, `action`, `user_id`, `payload`

### `painter_requests`
- `case_id`, `description`, `request_type` (WORK/PARTS), `status` (PENDING/IN_PROGRESS/DONE/REJECTED — REJECTED נוסף ב-040), `response_note` (040 — הערה חופשית שמנהל השירות מקליד כשהוא סוגר בקשה), `created_by`, `reminder_sent_at` (038 — שער חד-פעמי לתזכורת אסקלציה)
- **מוצג בשני מקומות:** `/painters/[id]` (לוח הפחח) וגם ישירות בתוך `/cases/[id]` (`PainterRequestsSection.tsx`) — שם מנהל שירות/CEO יכולים ללחוץ על בקשה פתוחה ולסמן בוצע/נדחה עם הערה, בלי לצאת מהתיק.

### `painter_request_images`
- `request_id`, `image_path` (bucket: `painter-images`)

### `referrals` (039) — הפניות טרום-תיק
- `branch_id`, `customer_name`, `insurance_company`, `claim_type`, `vehicle_type`, `vehicle_year`, `plate_number`, `appraiser_name`, `phone`, `status_note` (תצוגה מקדימה — מסונכרן אוטומטית מהעדכון האחרון ביומן, **לא** ניתן לעריכה ישירה יותר, ראה 045), `status` (ACTIVE/CONVERTED/CANCELLED), `case_id` (מתמלא כשהופכת לתיק), `current_status_tag` (042 — דנורמליזציה של התגית האחרונה מהיומן, לצביעה ברשימה בלי שאילתה נוספת), `follow_up_date` / `follow_up_reminder_sent_at` (043 — תאריך תזכורת + שער חד-פעמי)
- **צביעה בצהוב ב-`/referrals`:** referral עם `status='ACTIVE'` וגם `current_status_tag='AWAITING_PAPERWORK'`
- **מספר רכב** מפעיל את אותה שליפה ממשרד התחבורה (`vehicleLookup.ts`) שקיימת בפתיחת תיק רגילה — ממלא סוג/שנת רכב אוטומטית
- **טאבים לפי סניף** ב-`/referrals` (הכל/נתיבות/אשקלון) — אותו `SegmentedControl`/`ReferralsGrid.tsx` כמו ב-`/cases` וב-`/closure`

### `referral_status_updates` (042) — יומן מעקב הפניה
- `referral_id`, `status_tag` (AWAITING_REPLACEMENT_CAR/AWAITING_PAPERWORK/AWAITING_SCHEDULING/OTHER, nullable), `note`, `created_by`, `created_at`
- שורה חדשה בכל עדכון — **לא** דורס את הקודם, בניגוד לאיך ש-`status_note` עבד פעם. תגית (אם נבחרה) וגם ההערה (אם הוזנה) מסונכרנות ל-`referrals.current_status_tag`/`status_note`.
- **תיקון bug אמיתי (045):** עד הסשן הזה הייתה תיבת טקסט נפרדת בעמוד הפנייה לעריכת `status_note` ישירות, במקביל ליומן — עמית מילא אותה וציפה שהצביעה תעבוד, אבל הצביעה תלויה רק ב-`current_status_tag` שרק היומן מעדכן. התיבה הנפרדת הוסרה; כל עדכון סטטוס עובר עכשיו רק דרך היומן (`addReferralStatusUpdate`), וגם `createReferral`'s הערה הראשונית הופכת לשורה ראשונה ביומן. מיגרציה 045 backfill-ה הערות status_note קיימות שלא היה להן שורת יומן.

### `referral_documents`
- `referral_id`, `file_name`, `file_path` (bucket: `referral-documents`), `file_size`, `mime_type`, `uploaded_by`

### `case_documents`
- `case_id`, `file_name`, `file_path`, `file_size`, `mime_type`, `document_type`, `uploaded_by`

### `role_permissions`
- `role`, `action`, `enabled` — מטריצת הרשאות דינמית

### `workflow_step_templates`
- `step_key`, `step_label`, `order_index`, `is_enabled`, `requires_link`, `requires_file_or_link`, `requires_ceo_approval`

### `system_messages`
- `message`, `is_active` — הודעות מערכת לכל המשתמשים

### `branches`
- `name` — NETIVOT / ASHKELON

### `schema_migrations` (036)
- `filename`, `applied_at` — מעקב פורמלי אחרי אילו מיגרציות רצו בפרודקשן. **כל מיגרציה חדשה חייבת לסיים ב-`INSERT INTO schema_migrations (filename) VALUES (...) ON CONFLICT (filename) DO NOTHING`.**

---

## 9. Storage Buckets

| Bucket | שימוש | גישה |
|--------|--------|------|
| `extras-images` | תמונות תוספות פחחות | Private, authenticated |
| `painter-images` | תמונות בקשות פחח | Private, authenticated |
| `referral-documents` | מסמכים מצורפים להפניה | Private, authenticated, RLS לפי סניף ותפקיד (039) |

---

## 10. Server Actions — מפה מלאה

### `workflow.ts`
- `createCase(input)` — יוצר car + case + workflow run + steps; גם מתריע לפחחי הסניף עם קישור `/go/[id]`
- `completeActiveStep(caseId, stepId)` — מסמן שלב DONE, מפעיל הבא, לוגיקה מיוחדת לכל שלב
- `returnToEstimate(caseId)` — מחזיר ל-PREP_ESTIMATE
- `deleteCase(caseId)` — **soft delete** (deleted_at, CEO בלבד)
- `restoreCase(caseId)` — שחזור תיק מחוק (CEO בלבד)

### `approvals.ts`
- `getApprovals()` — שולף אישורים פנדינג
- `decideApproval(id, status, note)` — אישור/דחייה + revalidatePath

### `caseDetails.ts`
- `updateCaseDetails(caseId, caseUpdates, carUpdates?)` — עדכון inline של שדות

### `documents.ts`
- `uploadCaseDocument(formData)` — העלאה ל-storage + DB record
- `deleteCaseDocument(id)` — מחיקה
- `getSignedFileUrls(bucket, paths)` — signed URLs מרובים (נעשה גם reuse עבור referral-documents)

### `extras.ts`
- `createExtra(input)` — יצירת תוספת פחח עם upload תמונה
- `updateExtraStatus(id, status)` — שינוי סטטוס (SERVICE_MANAGER/CEO)

### `painter.ts`
- `updatePainterChecklist(caseId, updates)` — נכנס לעבודה / התקבל חלקים
- `createPainterRequest(caseId, desc, type, images?)` — בקשת תוספת + התראה ליועצים, `action_url` עם `?highlight=<id>`
- `getPainterRequests(caseId)`
- `updatePainterRequestStatus(id, status, note?)` — סטטוס כולל `REJECTED`; `note` נשמר ב-`response_note` ומופיע בהתראה חזרה לפחח

### `referrals.ts`
- `createReferral(input)` / `updateReferral(id, updates)` / `cancelReferral(id)` — CRUD בסיסי, OFFICE+CEO בלבד
- `convertReferral(referralId, caseId)` — נקרא אחרי יצירת תיק מההפניה, מקשר ומעדכן status ל-CONVERTED
- `addReferralStatusUpdate(id, statusTag, note)` — מוסיף שורה ליומן המעקב, מסנכרן `current_status_tag`
- `getReferralStatusUpdates(id)` — שולף את היומן
- `setReferralFollowUpDate(id, date)` — קובע/מנקה תאריך תזכורת, מאפס את שער השליחה
- `uploadReferralDocument(formData)` / `deleteReferralDocument(id)`

### `settings.ts`
- `getRolePermissions()` / `updateRolePermission(role, action, enabled)`
- `getWorkflowStepTemplates()` / `updateWorkflowStep()` / `addWorkflowStep()` / `removeWorkflowStep()`
- `getBodyworkAdvisors()` / `toggleBodyworkAdvisor(profileId, isAdvisor)`

### `notifications.ts`
- `getNotifications()` / `markAsRead(id)` / `markAllAsRead()`

### `push.ts`
- `savePushSubscription(sub)` / `removePushSubscription(endpoint)` — ניהול Push API subscription
- `sendPushToUser(userId, payload)` — שולח web push לכל ה-subscriptions של משתמש בודד
- `pushToOverseers(payload, excludeUserId?)` — שולח לכל CEO + SERVICE_ADVISOR; **CEO תמיד מקבל, גם אם `excludeUserId` הוא הוא עצמו** (מיגרציה 041)
- `sendTestPushToSelf()` — כלי אבחון, נגיש מ-`/settings`

### `vehicleLookup.ts`
- `lookupVehicleByPlate(plate)` — שולף סוג/שנת רכב מ-data.gov.il (מאגר משרד התחבורה); בשימוש גם ב-`CreateCaseButton` וגם בהפניות

### `reports.ts`
- `sendSummaryReport()` — דוח סיכום יומי דרך Resend, CEO-only, נשלח גם ידנית (כפתור ב-`/settings`) וגם דרך cron

---

## 11. לוגיקת אירועים אוטומטיים (Automation)

| טריגר | מה קורה |
|-------|---------|
| שלב `READY_FOR_OFFICE` הושלם | 1. התראה לכל OFFICE בסניף 2. יוצר CLOSURE workflow run עם 4 שלבים |
| שלב `WASH` הושלם | התראה לכל `is_bodywork_advisor = true` בסניף |
| שלב `WAIT_APPRAISER_APPROVAL` הושלם | יוצר `ESTIMATE_AND_DETAILS` approval אם לא קיים |
| בקשת פחח נשלחת | התראה לכל `is_bodywork_advisor = true` בסניף, עם קישור `?highlight=` לבקשה עצמה |
| מנהל שירות/CEO עונה לבקשת פחח | התראה חזרה לפחח שפתח את הבקשה, כולל ההערה שהוקלדה |
| `SEND_COMPLETION_PHOTOS`/`READY_FOR_OFFICE` בלי אישור `ESTIMATE_AND_DETAILS` | חסימה + יצירת approval PENDING אם חסר. `CLOSE_CASE` עצמו לא בודק את זה שוב — רק extras IN_TREATMENT |
| WHEELS_CHECK הושלם | התראת FYI לעמית (CEO) בלבד — **לא** יוצר `ceo_approvals` יותר (הוסר 044, עמית ביקש רק התראה, לא אישור חוסם) |
| כל התראה נוצרת | fanout ל-CEO + יועצים חוצי-סניף (ראה סעיף 8, טבלת `notifications`) |

### תזכורות מתוזמנות — `/api/cron/enter-work-reminders` (038, 043)
Route יחיד עם ארבעה סבבים, מופעל חיצונית כל 30 דקות (GitHub Actions, לא Vercel Cron — Hobby plan לא תומך בתדירות הזו). כל סבב אידמפוטנטי (שער `*_sent_at`), אז תדירות הפינג לא קריטית.

| # | מה בודק | תנאי | מגבלה |
|---|---------|------|--------|
| 1 | `ENTER_WORK` הושלם אך `painter_entered_work_at` ריק | כל ~110 דק׳ | רק בשעות עבודה (9-17, לא שישי/שבת/חג) |
| 2 | בקשת פחח PENDING | אחרי שעה | חד-פעמי; לא יותר מ-48 שעות אחורה (למניעת "הצפה" של בקשות ישנות) |
| 3 | תיק מוכן לסגירה, אף OFFICE לא פתח את ההתראה | אחרי שעה | חד-פעמי; לא יותר מ-48 שעות אחורה |
| 4 | הפניה עם `follow_up_date` שהגיע | ביום שנקבע | חד-פעמי, בלי הגבלת גיל (תאריך נבחר במפורש, לא timestamp שיכול "להתיישן") |

הפנייה שהופכת לתיק (`convertReferral`) יוצאת אוטומטית מהפול של סבב 4 — אין צורך לבטל תזכורת באופן ידני.

---

## 12. RLS Policy Pattern

**כלל ראשי:** כל טבלה מוגנת לפי `branch_ids` של המשתמש (array), דרך פונקציות helper:
- `public.get_my_branch_ids()` — ה-branch_ids array של המשתמש המחובר (046: היה `get_my_branch_id()` יחיד)
- `public.get_my_role()` — ה-role של המשתמש המחובר
- `public.can_see_all_branches()` — true עבור CEO, ועבור כל role עם `sees_all_branches=true`
- **RLS Operator (046):** `branch_id = ANY(public.get_my_branch_ids())` — בודק אם branch של הרשומה נמצא בarray של המשתמש

⚠️ **חשוב:** 
- מיגרציה 018 הצהירה שהיא יוצרת `current_user_branch_id()`/`current_user_role()`, אבל בפועל הפונקציות הן `get_my_branch_id()`/`get_my_role()`.
- **מיגרציה 046** שינתה את `get_my_branch_id()` ל-`get_my_branch_ids()` (plural, returns uuid[]) ועדכנה את כל ה-RLS policies להשתמש ב-`= ANY()` operator לתמיכה multi-branch.
- לפני שסומכים על שם פונקציה — לוודא מול הפרודקשן בפועל: `POST {SUPABASE_URL}/rest/v1/rpc/<function_name>` עם ה-service-role key; `404`/`PGRST202` = לא קיימת.

**Soft delete:** `cases_select` מסנן `deleted_at IS NULL` לכולם חוץ מ-CEO — וכל שאילתת select אחרת על cases צריכה לעשות את זה בעצמה גם ברמת האפליקציה (ה-RLS לא תמיד מספיק, ראה סעיף 8).

**הרצת SQL (עודכן 2026-09-01):** קיים עכשיו Supabase CLI מקומי מקושר לפרויקט הפרוד (`supabase link`, ראה סעיף 22). אפשר להריץ מיגרציות דרך `supabase db push` או להמשיך להדביק ידנית ל-Supabase Dashboard → SQL Editor — **בכל מקרה: backup לפני (סעיף 19), ולעדכן את היסטוריית ה-CLI** (`supabase migration repair --status applied <ts>` אם הודבק ידנית). קוד האפליקציה עצמו עדיין בלי `DATABASE_URL`/Management API token. תמיד לכתוב מיגרציות עם `DROP POLICY/TRIGGER/CONSTRAINT IF EXISTS` לפני `CREATE`, כדי שהרצה חלקית שנכשלה לא תחסום ניסיון תיקון חוזר.

---

## 13. ארכיטקטורת הקוד

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

### Client-Side Reload
```typescript
// בתוך CaseDetailClientV2: לא משתמשים ב-router.refresh() בכל שלב
// כי גורם לflicker — במקום זה:
await reloadStepsFromDB(); // קורא ל-Supabase client ישירות
```

### הודעות עם highlight/deep-link
דפוס חוזר בכל המערכת (אישורים, שלבי workflow, בקשות פחח): `action_url` של התראה כולל `?highlight=<id>`, והקומפוננט הרלוונטי (`ApprovalsList`, `WorkflowStepsSection`, `PainterCaseClient`, `PainterRequestsSection`) קורא את הפרמטר עם `useSearchParams`, גולל אליו (`scrollIntoView`) ומדגיש אותו חזותית (`ring`). כל צרכן בודק בעצמו שה-id באמת קיים אצלו — אם לא, זה no-op שקט.

---

## 14. עמודים לפי Role

| Role | עמודים |
|------|--------|
| SERVICE_MANAGER | `/cases`, `/cases/[id]`, `/painters/[id]` (עונה לבקשות פחח), `/extras`, `/notifications` |
| OFFICE | `/cases`, `/cases/[id]`, `/closure`, `/referrals`, `/notifications` |
| CEO | **הכל** + `/approvals`, `/painters`, `/painters/[id]`, `/referrals`, `/settings` |
| PAINTER | `/painters` (רשימה), `/painters/[id]` (תיק פחח), `/extras/new`, `/extras/mine` |
| SERVICE_ADVISOR | `/cases` (read-only), `/notifications` |

כל התראה "לפי תיק" מנותבת קודם דרך `/go/[caseId]` שמפנה כל role לעמוד הנכון לו (ראה סעיף 8/13) — כך שאין צורך שכל role ידע את הנתיב הישיר של role אחר.

---

## 15. נתיבי קבצים קריטיים

| קובץ | מה הוא עושה |
|------|-------------|
| `src/app/(dashboard)/cases/[id]/CaseDetailClientV2.tsx` | הקומפוננט הכבד ביותר — צ'קליסט, פרטי תיק, בקשות פחח, מסמכים, אודיט |
| `src/app/(dashboard)/cases/[id]/page.tsx` | Server Component — שולף הכל, מעביר ל-Client |
| `src/app/(dashboard)/cases/[id]/PainterRequestsSection.tsx` | בקשות פחח בתוך התיק, כולל מודל בוצע/נדחה + הערה |
| `src/app/actions/workflow.ts` | לוגיקת ה-workflow המרכזית |
| `src/app/actions/referrals.ts` | הפניות, יומן מעקב, תזכורות |
| `src/app/actions/push.ts` | Web Push + fan-out ל-overseers |
| `src/app/api/cron/enter-work-reminders/route.ts` | כל תזכורות ה-cron (4 סבבים, ראה סעיף 11) |
| `src/app/go/[id]/page.tsx` | ניתוב role-neutral להתראות |
| `src/types/database.ts` | כל ה-types — הראשון לעדכן בשינויי schema |
| `src/db/migrations/` | מיגרציות SQL 001–046 — **היסטוריה קפואה**. מיגרציות חדשות ב-`supabase/migrations/` (סעיף 22) |
| `supabase/migrations/` | מיגרציות CLI חדשות — baseline `20260901180001_remote_schema.sql` = מצב הפרוד ב-046 |
| `src/app/(dashboard)/layout.tsx` | Navigation לפי role |
| `src/app/(dashboard)/painters/[id]/PainterCaseClient.tsx` | ממשק הפחח הנפרד |
| `src/app/(dashboard)/painters/PaintersBoard.tsx` | לוח כרטיסי הפחחים (`/painters`) — `carLineFor()` מעדיף `vehicle_type` |
| `src/app/(dashboard)/referrals/[id]/ReferralDetailClient.tsx` | פרטי הפנייה, יומן מעקב, תאריך תזכורת |
| `src/app/(dashboard)/referrals/ReferralsGrid.tsx` | רשימת הפניות + טאבי סניף |
| `src/app/(dashboard)/settings/BodyworkAdvisorsTab.tsx` | ניהול יועצי פחח |

---

## 16. Migrations — היסטוריה & Hotfixes

### 🔥 Hotfix 2026-09-01: Referrals RLS Multi-Branch Fix
**Problem:** OFFICE staff (Ilana) with multi-branch support couldn't see referrals from second branch  
**Root Cause:** RLS policies used singular `get_my_branch_id()` instead of array `get_my_branch_ids()`  
**Fix Applied:** Updated 3 policies on `referrals` table:
- `referrals_select`: Changed `branch_id = get_my_branch_id()` → `branch_id = ANY(get_my_branch_ids())`
- `referrals_insert`: Same change
- `referrals_update`: Same change

**Verification:** SQL test confirms Ilana now sees 8 referrals (5 ashkelon + 3 netivot), 17 cases (6+11)

| Migration | תוכן |
|-----------|------|
| 001 | Schema ראשוני, enums, RLS |
| 002 | Storage policies |
| 003-004 | Schema align, seed branches |
| 005 / 005b | case_documents + storage, verification gaps |
| 006 | שדות חדשים בתיק: customer_name, phone, insurance_company, appraiser_name, event_date, wheels_check_link, sub_claim_type |
| 007 | AIRMAIL_PENDING לparts_status |
| 008 | עדכון workflow steps |
| 009 | role_permissions + workflow_step_templates |
| 010-012 | RLS fixes ל-CEO, requires_ceo_approval |
| 013 | painter_status, parts_ordered, qc_assignee, estimate_link, appraiser_status |
| 014 | performance indexes |
| 015 | closure_checklist_state (jsonb) |
| 016 | appraiser_status column |
| 017 | soft delete, is_bodywork_advisor, painter_requests, painter_request_images, document_type |
| 018 | fix RLS recursion (⚠️ שם הפונקציות בפועל שונה מהמתועד בקובץ — ראה סעיף 12) |
| 019 | restore CEO bypass for profiles + audit_events |
| 020 | enter_work_checklist_state, catalog/parts/photos assignees, notifications.triggered_by + action_url |
| 021-022 / 022b | push_subscriptions + עדכון + branch-scoped storage RLS |
| 023 | מניעת race condition ב-CLOSURE workflow |
| 024-025 | security hardening + performance indexes + search_path |
| 026 / 026b | Realtime על notifications + תיקון profiles_select |
| 027 / 027b | timestamps לצ'קליסט פחח + CEO מקבל כל התראה (הבסיס למיגרציה 041) |
| 028 | `sees_all_branches` — גישה חוצת-סניף בלי להיות CEO |
| 030 | `branch_recipients()` — resolver אחיד לנמעני התראות בסניף |
| 031-032 | fan-out התראות ל-CEO/יועצים חוצי-סניף (טריגר `fanout_notifications_to_ceos`) |
| 033 | storage cross-branch access |
| 034 | painter_status='OTHER' + טקסט חופשי |
| 035 | עמודת מעקב לתזכורת ENTER_WORK |
| 036 | `schema_migrations` — מעקב פורמלי אחרי מיגרציות שרצו |
| 037 | sub_claim_type: MILITARY/OTHER |
| 038 | escalation reminders — בקשת פחח / תיק ממתין לסגירה |
| 039 | מודול הפניות (`referrals`, `referral_documents`) |
| 040 | painter_requests: סטטוס REJECTED + `response_note` |
| 041 | CEO מקבל התראות גם על פעולות שהוא עצמו ביצע |
| 042 | יומן מעקב הפניות (`referral_status_updates`) + `current_status_tag` |
| 043 | תאריך תזכורת להפניה (`follow_up_date` + `follow_up_reminder_sent_at`) |
| 044 | WHEELS_CHECK מפסיק לדרוש אישור CEO — מנקה approvals PENDING קיימים מסוג זה |
| 045 | Backfill: `status_note` ישן → שורת יומן ראשונה ב-`referral_status_updates` |
| **046** | **Multi-branch OFFICE staff:** `profiles.branch_id` (single) → `branch_ids[]` (array); כל RLS policies עדכונות להשתמש ב-ANY() operator; OFFICE staff (אילנה, אביה) עכשיו יכולות להיות 2+ סניפים עם טאבים בכל דף |

> **2026-09-01 — CLI re-baseline:** מ-046 והלאה עוברים ל-Supabase CLI. `src/db/migrations/001–046` קפואים כהיסטוריה; ה-baseline החדש הוא `supabase/migrations/20260901180001_remote_schema.sql` (= מצב הפרוד ב-046). מיגרציות חדשות ב-`supabase/migrations/` בלבד. ראה סעיף 22.

---

## 17. גיט ו-Deploy

- **Repository:** GitHub (sasha463111/amit-maymon-new)
- **Branch:** `main` — זו הסביבה החיה, אין staging. פוש ל-`main` = דיפלוי לפרודקשן.
- **Deploy:** Vercel **native Git integration** — כל פוש ל-`main` מדפלייר אוטומטית **שני** פרויקטי Vercel (`amit-maymon-new` + `amit-maymon-new-iyub`) ששניהם מחוברים לאותו repo. אין GitHub Action לדיפלוי (הוסר — היה מיותר ותקוע על טוקן ישן).
- **GitHub Actions שכן קיים:** `.github/workflows/enter-work-reminders.yml` — מפינג את ה-cron route כל 30 דקות (לא קשור לדיפלוי).
- **מיגרציות DB הן שלב נפרד לגמרי מהדיפלוי** — פוש קוד לא מריץ SQL. מריצים דרך `supabase db push` או ידנית ב-SQL Editor, תמיד עם backup (ראה סעיף 12 + 22).
- **Vercel Region:** `iad1` (הועבר מ-fra1 כדי לעקוף replica lag ישן של Supabase — commit `c26b715`. אל תחזיר ל-fra1.)

---

## 18. משתמשי בדיקה

התחברות היא **email בלבד, בלי סיסמה** — `signInWithPassword` עם סוד משותף (`EMAIL_ONLY_LOGIN_PASSWORD` ב-`.env.local`).

חשבונות בדיקה אמיתיים (אחד לכל role, מאומתים בעבר בדפדפן חי) מתועדים כ-`QA_ACCOUNT_*` בהערה ב-`.env.local` — **לא מועתקים לכאן בכוונה** (ההערה עצמה אומרת "never commit these anywhere else"). לבדיקה חיה — לפתוח את `.env.local` מקומית.

---

## 19. כללי עבודה עם הפרויקט

1. **UI/UX חדש** → תמיד להשתמש ב-Stitch MCP (`mcp__stitch__*`) לפני כתיבת קומפוננטים, אם זמין
2. **שינויי DB** → `supabase migration new <name>` → כותבים SQL עם `DROP ... IF EXISTS` לפני `CREATE`, מסתיים ב-INSERT ל-`schema_migrations` → בודקים מקומית (`supabase db reset`) → מריצים לפרוד (`supabase db push` או SQL Editor + `migration repair --status applied`), עם backup קודם. ראה סעיף 12 + 22
3. **RLS** → כל שינוי schema חייב לעדכן policies בהתאם, ולהשתמש בשמות הפונקציות האמיתיים (`get_my_branch_id`/`get_my_role`/`can_see_all_branches`)
4. **types/database.ts** → לעדכן ראשון בכל שינוי schema
5. **Server Actions** → `'use server'` בראש, תמיד לאמת role לפני פעולה
6. **Soft delete** → תמיד לסנן `.is('deleted_at', null)` בכל שאילתת SELECT על cases (ובכל שאילתה שמצטרפת ל-cases, כמו extras/closure)
7. **הוספת עמוד** → לעדכן navigation ב-`layout.tsx` לפי role
8. **התראות שמצביעות על משהו ספציפי בתוך עמוד** → להשתמש בדפוס `?highlight=<id>` הקיים (ראה סעיף 13), לא להמציא מנגנון חדש
9. **לפני פוש לפרודקשן** → `npx tsc --noEmit` + `npm run build` (לא בזמן ש-`npm run dev` רץ) + בדיקה חיה עם דפדפן אמיתי; לנקות כל נתוני בדיקה מה-DB אחרי

### 🚨 **BACKUP BEFORE EVERY PUSH** (2026-09-01)

**10. סטנדינג ריל: Backup לפני כל Push לפרודקשן** ⚠️
- **לפני כל `git push origin main`** חייב להוצא backup של מסד הנתונים!
- **רוץ:** `.\SqlBackup\backup-before-push.ps1`
- ה-script ירוץ backup אוטומטי, יבדוק שהצליח, ויבקש אישור לפני push
- **אם backup נכשל:** אל תדחוף! תקן את הבעיה קודם (ודא `pg_dump` מותקן)
- Backups נשמרים ב-`C:\GitHub\amit-maymon-new\SqlBackup`
- **Auto-cleanup:** backups ישנים מ-30 ימים יוחקו אוטומטית

**11. Backup Implementation** 📅
- **Manual Backup (Working):** לפני כל `git push origin main`, הריץ: `.\SqlBackup\backup-before-push.ps1`
  - Script ירוץ backup אוטומטי + יבדוק הצלחה + יבקש אישור לפני push
  - Backups נשמרים ב-`C:\GitHub\amit-maymon-new\SqlBackup\` עם timestamp
  - Log file: `C:\GitHub\amit-maymon-new\SqlBackup\backup_log.txt`
- **Daily Automatic (Future):** Task Scheduler דורש credentials שלא זמינים כרגע
  - אפשרות לעתיד: cron חיצוני (GitHub Actions, Vercel Cron) או cloud backup service
- **Recovery:** אם יש data loss (כמו Migration 046):
  ```bash
  # 1. שחזור מ-backup
  pg_restore -d postgres://user:pass@host/db C:\GitHub\amit-maymon-new\SqlBackup\backup_YYYYMMDD_HHMMSS.sql
  # 2. או SQL manual restore
  UPDATE profiles SET branch_ids = ARRAY[...] WHERE id = ...;
  ```

**12. Migration Best Practices** (תוקן אחרי Migration 046 failure) 🔧
- **תמיד** ליצור column חדשה **לפני** הורדת הישנה
- **תמיד** לעשות BACKFILL של נתונים קודם
- **תמיד** לבדוק אם יש data loss אחרי migration
- דוגמה (✅ RIGHT):
  ```sql
  -- ✅ צור column חדשה
  ALTER TABLE profiles ADD COLUMN branch_ids uuid[] NOT NULL DEFAULT '{}';
  
  -- ✅ Backfill נתונים
  UPDATE profiles SET branch_ids = ARRAY[branch_id] WHERE branch_id IS NOT NULL;
  
  -- ✅ Drop הישנה
  ALTER TABLE profiles DROP COLUMN branch_id;
  ```
- דוגמה (❌ WRONG — כמו Migration 046):
  ```sql
  -- ❌ ישירות drop — data loss!
  ALTER TABLE profiles DROP COLUMN branch_id;
  ALTER TABLE profiles ADD COLUMN branch_ids uuid[];  -- ריק!
  ```

---

## 20. Email Setup (Resend) — 2026-09-01

**Status:** 🔄 In Progress  
**Domain:** toyota-tehila.co.il (דוח סיכום יומי via reports@toyota-tehila.co.il)  
**Service:** Resend API (RESEND_API_KEY in .env.local)  

**DNS Records Status:**
- ✅ DKIM (TXT): resend._domainkey
- ✅ SPF (TXT): v=spf1 include:amazonses.com ~all
- ✅ MX: feedback-smtp.ap-northeast-1.amazonses.com
- ✅ DMARC (TXT): v=DMARC1; p=none;

**Next:** Hosting provider adds records → wait 5-30 min → Resend verification → Test `/settings` → "שלח דוח סיכום"

---

## 21. Supabase Region (הערה חשובה)

**הפרויקט הנוכחי אינו בפרנקפורט.** אי אפשר להעביר project קיים.
כדי לשפר latency עתידית: צור project חדש ב-`eu-central-1`, הרץ כל המיגרציות, עדכן `.env.local` + Vercel env vars (ראה `SUPABASE_MIGRATION_GUIDE.md` בשורש הריפו — זה תכנון עתידי, לא בתהליך).

---

## 22. Supabase CLI + Local Dev (הוקם 2026-09-01)

**סטטוס:** מותקן, מקושר לפרוד, ו-local stack מאומת עובד.

### הקמה
- `supabase` הוא devDependency (`package.json`). מפעילים עם `npx supabase <cmd>` מ-`C:\GitHub\amit-maymon-new`.
- דרישות מקדימות: Docker Desktop (WSL2 backend) חייב לרוץ.
- מקושר לפרוד: `supabase link --project-ref yhanmyvolpeiuxspcxmk`. סיסמת ה-DB שמורה ב-keyring של Windows מאז ה-link — פקודות `db pull` / `migration` / `db dump` מתחברות בלי לשאול.
- `config.toml`: `major_version = 17` (תואם לפרוד — Postgres engine 17).

### Re-baseline של היסטוריית המיגרציות
טבלת `supabase_migrations.schema_migrations` בפרוד הכילה 20 רשומות חלקיות (מיגרציות ~016–029 שהורצו דרך Supabase MCP `apply_migration` באפריל–יוני 2026; 001–015 ו-030–046 מעולם לא נרשמו שם — הורצו ידנית ב-SQL Editor). ב-2026-09-01:
1. גיבוי מלא של הפרוד → `C:\Backups\CRM\pre-cli-rebaseline_2026-09-01\` (schema + data + roles).
2. ארכיון של 20 הרשומות עם ה-SQL המלא → `supabase/_archive/remote_history_pre_rebaseline_2026-09-01.sql`.
3. `supabase migration repair --status reverted <20 versions>` — ניקה את הרישום (רק metadata; סכמה/דאטה לא נגעו).
4. `supabase db pull` → יצר `supabase/migrations/20260901180001_remote_schema.sql` = מצב הפרוד המלא ב-046 (22 טבלאות, 56 policies, 16 functions). זו נקודת ההתחלה של ה-CLI.
5. אומת: `supabase start` הפעיל DB מקומי טרי והחיל את ה-baseline נקי, ספירת אובייקטים זהה לפרוד.

`src/db/migrations/001–046` נשארים כהיסטוריה קפואה — לא מומרים, לא נמחקים.

### Workflow למיגרציה חדשה
```
npx supabase migration new <name>       # יוצר supabase/migrations/<ts>_<name>.sql
# כותבים SQL: DROP ... IF EXISTS לפני CREATE, מסתיים ב-INSERT ל-schema_migrations
npx supabase db reset                    # מחיל את הכל מאפס על ה-DB המקומי — בדיקה
# ... בודקים מול הסטאק המקומי ...
# backup לפרוד: .\SqlBackup\backup-before-push.ps1 (או supabase db dump)
npx supabase db push                     # ← ברירת המחדל: מחיל לפרוד + מעדכן היסטוריה
```
> **מסלול הפרוד (נקבע 2026-09-01):**
> 1. **ברירת מחדל — `supabase db push`.** תמיד לנסות קודם.
> 2. **Fallback — SQL Editor ידני**, כשה-push לא מתאפשר (חסום ע"י מנגנון ההרשאות של Claude, בעיית חיבור, או צריך הרצה חלקית/ידנית). אחרי הדבקה ידנית **חובה** לסנכרן את היסטוריית ה-CLI:
>    `npx supabase migration repair --status applied <ts>`
>
> בשני המקרים: backup לפני, וה-migration file נשמר תמיד ב-`supabase/migrations/`.

### פקודות שימושיות
- `npx supabase status` — URLs + keys של הסטאק המקומי (API 54321, DB 54322, Studio 54323, Mailpit 54324)
- `npx supabase stop` — עוצר (שומר נתונים מקומיים); `--no-backup` מאפס
- `npx supabase db diff -f <name>` — מייצר מיגרציה מהפרש סכמה מקומי
- `npx supabase gen types typescript --linked > src/types/database.gen.ts` — types מהפרוד
- `npx supabase db dump --linked -f <file>` (+ `--data-only` / `--role-only`) — גיבוי

### מגבלות ידועות
- `supabase login` (רענון token) ו-הפעלת Docker Desktop דורשים אינטראקציה ידנית.
- `supabase migration repair` / `db push` (כתיבה לפרוד) עלולים להיחסם ע"י מנגנון ההרשאות של Claude — המשתמש מריץ, או מוסיפים כלל הרשאה.
- החומרה (i7-3770K) איטית ל-local stack; זה עובד אבל לא מהיר.
