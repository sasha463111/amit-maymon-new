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
| `OFFICE` | אילנה, אביה | **1+ סניפים** (multi-branch) | סגירה אדמיניסטרטיבית: מסמכים, פרופורמה, טפסי סגירה; ניהול הפניות; עכשיו יכולות לעבוד עם 2+ סניפים עם טאבים |
| `CEO` | עמית | **כל הסניפים** | אישורים + גישה לכל + מחיקת תיקים + הגדרות; מקבל **כל** התראה במערכת כולל פעולות שהוא עצמו ביצע |
| `PAINTER` | ארז | סניף שלו | צ'קליסט פחח (נכנס לעבודה, חלקים), בקשות תוספות, תוספות פחחות |
| `SERVICE_ADVISOR` | כנרת | סניף שלה, או כל הסניפים | צפייה בלבד + יועצת פחח (מקבלת התראות) |

**CEO אינו מגביל branch** — `branch_ids = []` (ריק = כל הסניפים)
**OFFICE staff עכשיו multi-branch** — `branch_ids` array (מיגרציה 046)

**יועצי פחח** (`is_bodywork_advisor = true`): SERVICE_MANAGER + SERVICE_ADVISOR — מקבלים התראות על WASH ועל בקשות מהפחח.

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
| 2 | `WHEELS_CHECK` | טפסי גלגלים | SKIPPED אוטומטית אם גיל רכב ≤ 2 שנים |
| 3 | `PREP_ESTIMATE` | אומדן | אופציה להעלות קובץ אומדן |
| 4 | `SEND_TO_APPRAISER` | שליחה לשמאי | — |
| 5 | `WAIT_APPRAISER_APPROVAL` | המתנה לאישור שמאי | `requires_ceo_approval = true` |
| 6 | `ENTER_WORK` | כניסה לעבודה | אזהרה אם `parts_status ≠ AVAILABLE` |
| 7 | `ISSUE_CATALOG_NUMBERS` | ניפוק מק"טים | — |
| 8 | `PARTS_DISCOUNTS` | הנחות חלקים ועבודות | — |
| 9 | `QUALITY_CONTROL` | בקרת איכות | popup לבחירת יועץ |
| 10 | `WASH` | שטיפה | התראה ליועצי פחח בסיום |
| 11 | `SEND_COMPLETION_PHOTOS` | שליחת תמונות לשמאי גמר | — |
| 12 | `READY_FOR_OFFICE` | מוכן למשרד | התראה ל-OFFICE + פתיחת closure workflow אוטומטית |

**חסימות:**
- `READY_FOR_OFFICE`: חסום אם יש extras IN_TREATMENT, או אישורי CEO חסרים/נדחו
- `CLOSE_CASE`: רק בדיקה משותפת שאין extras ב-IN_TREATMENT

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

---

<important if="you need to understand or modify database schema, tables, or migrations">

## 9. DB Schema — טבלאות עיקריות

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

### `referral_status_updates` (042) — יומן מעקב הפניה
- `referral_id`, `status_tag` (AWAITING_REPLACEMENT_CAR/AWAITING_PAPERWORK/AWAITING_SCHEDULING/OTHER), `note`, `created_by`, `created_at`

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

### תזכורות מתוזמנות — `/api/cron/enter-work-reminders` (038, 043)
Route יחיד עם ארבעה סבבים, מופעל חיצונית כל 30 דקות (GitHub Actions).

| # | מה בודק | תנאי | מגבלה |
|---|---------|------|--------|
| 1 | `ENTER_WORK` הושלם אך `painter_entered_work_at` ריק | כל ~110 דק׳ | רק בשעות עבודה (9-17) |
| 2 | בקשת פחח PENDING | אחרי שעה | חד-פעמי; לא יותר מ-48 שעות אחורה |
| 3 | תיק מוכן לסגירה, אף OFFICE לא פתח את ההתראה | אחרי שעה | חד-פעמי; לא יותר מ-48 שעות אחורה |
| 4 | הפניה עם `follow_up_date` שהגיע | ביום שנקבע | חד-פעמי, בלי הגבלת גיל |

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

