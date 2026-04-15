# CLAUDE.md — Tehila Bodyshop CRM
## כל מה ש-Claude Code צריך לדעת על הפרויקט

---

## 1. מהו הפרויקט?

**Tehila Bodyshop CRM** — מערכת ניהול תיקים למוסך פחחות תהילה.
מנהלת את כל תהליך תיקון רכב מהגעתו הפיזית למוסך ועד סגירת התיק האדמיניסטרטיבית.

**עיקרון מרכזי:** המערכת מונעת על-ידי צ'קליסט. המשתמש לא משנה סטטוס ידנית — רק "סמן בוצע" מקדם שלב.

**לקוח:** עמית מיימון (CEO), מוסך פחחות תהילה, שני סניפים: נתיבות ואשקלון.

---

## 2. Stack טכנולוגי

| טכנולוגיה | גרסה | תפקיד |
|-----------|------|--------|
| **Next.js** | 14.2.18 (App Router) | Framework ראשי, SSR + Server Actions |
| **TypeScript** | 5.x | שפת הפיתוח |
| **Supabase** | @supabase/ssr | DB (Postgres), Auth, Storage |
| **TailwindCSS** | 3.x | Styling |
| **next-pwa** | — | PWA support |
| **Vercel** | — | Hosting, region: `fra1` (Frankfurt) |

**Supabase Project URL:** `https://yhanmyvolpeiuxspcxmk.supabase.co`

---

## 3. מבנה תיקיות

```
src/
  app/
    (dashboard)/          # כל הדפים המוגנים (אחרי login)
      layout.tsx          # Header + navigation per role
      cases/              # רשימת תיקים + יצירת תיק
        [id]/             # פרטי תיק (CaseDetailClientV2.tsx)
      approvals/          # אישורי CEO
      closure/            # סגירת תיקים (OFFICE + CEO)
      extras/             # תוספות פחחות (PAINTER)
      notifications/      # התראות
      painters/           # לוח פחח (CEO + PAINTER + SERVICE_MANAGER)
        [id]/             # עמוד פחח נפרד לתיק
      settings/           # הגדרות (CEO בלבד)
    actions/              # Server Actions
      workflow.ts         # יצירת תיק, השלמת שלב, מחיקה
      approvals.ts        # אישור/דחיית CEO
      caseDetails.ts      # עדכון פרטי תיק
      documents.ts        # העלאת/מחיקת מסמכים
      extras.ts           # ניהול תוספות
      notifications.ts    # התראות
      painter.ts          # צ'קליסט פחח + בקשות
      settings.ts         # הגדרות הרשאות + workflow + יועצי פחח
      auth.ts             # login/logout
    login/
  lib/
    supabase/
      client.ts           # Browser client
      server.ts           # Server client (cookies)
  types/
    database.ts           # כל ה-types, enums, interfaces
  db/
    migrations/           # SQL migrations 001–017
```

---

## 4. תפקידים (Roles)

| Role | שם | גישה | מה הם עושים |
|------|----|------|-------------|
| `SERVICE_MANAGER` | ערן | סניף שלו | מנהל workflow מקצועי: FixCar, אומדן, שמאי, כניסה לעבודה, QC, שטיפה |
| `OFFICE` | אילנה | סניף שלה | סגירה אדמיניסטרטיבית: מסמכים, פרופורמה, טפסי סגירה |
| `CEO` | עמית | **כל הסניפים** | אישורים בלבד + גישה לכל + מחיקת תיקים + הגדרות |
| `PAINTER` | ארז | סניף שלו | צ'קליסט פחח (נכנס לעבודה, חלקים), בקשות תוספות |
| `SERVICE_ADVISOR` | כנרת | סניף שלה | צפייה בלבד + יועצת פחח (מקבלת התראות) |

**CEO אינו מגביל branch** — `branch_id = NULL` בפרופיל שלו.

**יועצי פחח (`is_bodywork_advisor = true`):** SERVICE_MANAGER + SERVICE_ADVISOR — מקבלים התראות על WASH ועל בקשות מהפחח, ומוצגים ברשימה בבקרת איכות.

---

## 5. סניפים

- **NETIVOT** (נתיבות)
- **ASHKELON** (אשקלון)

RLS מבטיח שמשתמשים רואים רק את סניפם. CEO רואה הכל.

---

## 6. Workflow מקצועי (13 שלבים)

| # | step_key | שם עברי | הערות |
|---|----------|---------|-------|
| 0 | `OPEN_CASE` | פתיחת תיק | אוטומטי DONE בפתיחה |
| 1 | `FIXCAR_PHOTOS` | צילום FixCar | **חובה:** fixcar_link |
| 2 | `WHEELS_CHECK` | טפסי גלגלים | SKIPPED אוטומטית אם גיל רכב ≤ 2 שנים; קישור או קובץ |
| 3 | `PREP_ESTIMATE` | אומדן | אופציה להעלות קובץ אומדן |
| 4 | `SEND_TO_APPRAISER` | שליחה לשמאי | — |
| 5 | `WAIT_APPRAISER_APPROVAL` | המתנה לאישור שמאי | `requires_ceo_approval = true` |
| 6 | `ENTER_WORK` | כניסה לעבודה | אזהרה אם `parts_status ≠ AVAILABLE` |
| 7 | `ISSUE_CATALOG_NUMBERS` | ניפוק מק"טים | — |
| 8 | `PARTS_DISCOUNTS` | הנחות חלקים ועבודות | — |
| 9 | `QUALITY_CONTROL` | בקרת איכות | popup לבחירת יועץ מ-`bodywork_advisors` |
| 10 | `WASH` | שטיפה | בסיום → התראה ליועצי פחח |
| 11 | `SEND_COMPLETION_PHOTOS` | שליחת תמונות לשמאי גמר | — |
| 12 | `READY_FOR_OFFICE` | מוכן למשרד | בסיום → התראה לאילנה + פתיחת closure workflow אוטומטית |

**חסימות:**
- `READY_FOR_OFFICE`: חסום אם יש extras IN_TREATMENT, או אישורי CEO חסרים/נדחו
- `CLOSE_CASE`: חסום ללא אישור CEO מסוג `CASE_CLOSURE`

---

## 7. Workflow סגירה (4 שלבים)

| # | step_key | שם עברי |
|---|----------|---------|
| 0 | `CLOSURE_VERIFY_DETAILS_DOCS` | אימות מסמכים ופרטים |
| 1 | `CLOSURE_PROFORMA_IF_NEEDED` | פרופורמה אם נדרש |
| 2 | `CLOSURE_PREPARE_CLOSING_FORMS` | הכנת טפסי סגירה → יוצר `CASE_CLOSURE` approval |
| 3 | `CLOSE_CASE` | סגירה סופית |

**פותח אוטומטית** כשמשלימים `READY_FOR_OFFICE` ב-workflow המקצועי.

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
| `sub_claim_type` | enum | POLICY/THIRD_PARTY/... |
| `insurance_type` | enum | COMPREHENSIVE/THIRD_PARTY/PRIVATE/OTHER |
| `claim_type` | enum | PRIVATE/ACCIDENT/FLOOD |
| `fixcar_link` | text | |
| `wheels_check_link` | text | |
| `painter_status` | text | IN_WORK/WAITING_PARTS/PARTS_ARRIVED/READY_FOR_RELEASE |
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
| **`deleted_at`** | timestamptz | **Soft delete** — null = פעיל |
| **`deleted_by`** | uuid FK→profiles | **מי מחק** |

### `profiles` — משתמשים
| עמודה | סוג | הערות |
|-------|-----|-------|
| `id` | uuid = auth.uid() | |
| `full_name` | text | |
| `role` | enum user_role | |
| `branch_id` | uuid nullable | null = CEO |
| `is_active` | bool | |
| **`is_bodywork_advisor`** | bool | האם מקבל התראות פחח + ברשימת QC |

### `cars`
- `license_plate`, `make`, `model`, `year`, `vin`, `vehicle_type`, `first_registration_date`

### `case_workflow_runs`
- `case_id`, `workflow_type` (PROFESSIONAL/CLOSURE), `status` (ACTIVE/COMPLETED)

### `case_workflow_steps`
- `run_id`, `step_key`, `state` (PENDING/ACTIVE/DONE/SKIPPED), `order_index`, `completed_by`, `completed_at`

### `ceo_approvals`
- `case_id`, `approval_type` (ESTIMATE_AND_DETAILS/WHEELS_CHECK/CASE_CLOSURE), `status` (PENDING/APPROVED/REJECTED), `rejection_note`

### `bodywork_extras`
- `case_id`, `description`, `image_path`, `status` (IN_TREATMENT/REJECTED/DONE), `created_by`

### `notifications`
- `user_id`, `case_id`, `type`, `title`, `body`, `read`
- **סוגי type:** READY_FOR_OFFICE, WASH_STARTED, PAINTER_REQUEST, BLOCKED_ACTION, ...

### `audit_events`
- `entity_type` (CASE/WORKFLOW_STEP/APPROVAL/EXTRA), `entity_id`, `action`, `user_id`, `payload`

### `painter_requests` (Session 5)
- `case_id`, `description`, `request_type` (WORK/PARTS), `status` (PENDING/IN_PROGRESS/DONE), `created_by`

### `painter_request_images` (Session 5)
- `request_id`, `image_path` (bucket: `painter-images`)

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

---

## 9. Storage Buckets

| Bucket | שימוש | גישה |
|--------|--------|------|
| `extras-images` | תמונות תוספות פחחות | Private, authenticated |
| `painter-images` | תמונות בקשות פחח | Private, authenticated |

---

## 10. Server Actions — מפה מלאה

### `workflow.ts`
- `createCase(input)` — יוצר car + case + workflow run + steps
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

### `extras.ts`
- `createExtra(input)` — יצירת תוספת פחח עם upload תמונה
- `updateExtraStatus(id, status)` — שינוי סטטוס (SERVICE_MANAGER בלבד)

### `painter.ts`
- `updatePainterChecklist(caseId, updates)` — נכנס לעבודה / התקבל חלקים
- `createPainterRequest(caseId, desc, type, images?)` — בקשת תוספת + התראה ליועצים
- `getPainterRequests(caseId)`
- `updatePainterRequestStatus(id, status)`

### `settings.ts`
- `getRolePermissions()` / `updateRolePermission(role, action, enabled)`
- `getWorkflowStepTemplates()` / `updateWorkflowStep()` / `addWorkflowStep()` / `removeWorkflowStep()`
- `getBodyworkAdvisors()` / `toggleBodyworkAdvisor(profileId, isAdvisor)`

### `notifications.ts`
- `getNotifications()` / `markAsRead(id)` / `markAllAsRead()`

---

## 11. לוגיקת אירועים אוטומטיים (Automation)

| טריגר | מה קורה |
|-------|---------|
| שלב `READY_FOR_OFFICE` הושלם | 1. התראה לכל OFFICE בסניף 2. יוצר CLOSURE workflow run עם 4 שלבים |
| שלב `WASH` הושלם | התראה לכל `is_bodywork_advisor = true` בסניף |
| שלב `WAIT_APPRAISER_APPROVAL` הושלם | יוצר `ESTIMATE_AND_DETAILS` approval אם לא קיים |
| בקשת פחח נשלחת | התראה לכל `is_bodywork_advisor = true` בסניף |
| `READY_FOR_OFFICE` / `CLOSE_CASE` עם חסרים | חסימה + יצירת approvals אם חסרים |
| WHEELS_CHECK הושלם ויש קישור | יוצר `WHEELS_CHECK` approval |

---

## 12. RLS Policy Pattern

**כלל ראשי:** כל טבלה מוגנת לפי `branch_id` של המשתמש.
**CEO:** עובר מעל RLS עם `OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')`.
**Soft delete:** `cases_select` מסנן `deleted_at IS NULL` לכולם חוץ מ-CEO.

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

---

## 14. עמודים לפי Role

| Role | עמודים |
|------|--------|
| SERVICE_MANAGER | `/cases`, `/cases/[id]`, `/notifications` |
| OFFICE | `/cases`, `/cases/[id]`, `/closure`, `/notifications` |
| CEO | **הכל** + `/approvals`, `/painters`, `/painters/[id]`, `/settings` |
| PAINTER | `/painters` (רשימה), `/painters/[id]` (תיק פחח) |
| SERVICE_ADVISOR | `/cases` (read-only), `/notifications` |

---

## 15. נתיבי קבצים קריטיים

| קובץ | מה הוא עושה |
|------|-------------|
| `src/app/(dashboard)/cases/[id]/CaseDetailClientV2.tsx` | הקומפוננט הכבד ביותר — צ'קליסט, פרטי תיק, מסמכים, אודיט |
| `src/app/(dashboard)/cases/[id]/page.tsx` | Server Component — שולף הכל, מעביר ל-Client |
| `src/app/actions/workflow.ts` | לוגיקת ה-workflow המרכזית |
| `src/types/database.ts` | כל ה-types — הראשון לעדכן בשינויי schema |
| `src/db/migrations/` | מיגרציות SQL — Migration 017 היא האחרונה |
| `src/app/(dashboard)/layout.tsx` | Navigation לפי role |
| `src/app/(dashboard)/painters/[id]/PainterCaseClient.tsx` | ממשק הפחח הנפרד |
| `src/app/(dashboard)/settings/BodyworkAdvisorsTab.tsx` | ניהול יועצי פחח |

---

## 16. Migrations — היסטוריה

| Migration | תוכן |
|-----------|------|
| 001 | Schema ראשוני, enums, RLS |
| 002 | Storage policies |
| 003-004 | Schema align, seed branches |
| 005 | case_documents + storage |
| 006 | שדות חדשים בתיק: customer_name, phone, insurance_company, appraiser_name, event_date, wheels_check_link, sub_claim_type |
| 007 | AIRMAIL_PENDING לparts_status |
| 008 | עדכון workflow steps (הסרת SUMMARIZE_ESTIMATE, הוספת 3 חדשים) |
| 009 | role_permissions + workflow_step_templates |
| 010-012 | RLS fixes ל-CEO, requires_ceo_approval |
| 013 | feature additions (painter_status, parts_ordered, qc_assignee, estimate_link, appraiser_status) |
| 014 | performance indexes |
| 015 | closure_checklist_state (jsonb) |
| 016 | appraiser_status column |
| **017** | **soft delete (deleted_at/deleted_by), is_bodywork_advisor, painter_requests, painter_request_images, document_type** |

---

## 17. גיט ו-CI/CD

- **Repository:** GitHub (sasha463111/amit-maymon-new)
- **Branch:** `main`
- **CI/CD:** GitHub Actions (`.github/workflows/deploy.yml`) → Vercel auto-deploy על כל push ל-main
- **Vercel Region:** `fra1` (Frankfurt — הכי קרוב לישראל)

---

## 18. משתמשי בדיקה

| Email | Password | Role |
|-------|----------|------|
| `ceo@test.com` | `TestCEO123!` | CEO |
| `manager@test.com` | `TestManager123!` | SERVICE_MANAGER |

---

## 19. כללי עבודה עם הפרויקט

1. **UI/UX חדש** → תמיד להשתמש ב-Stitch MCP (`mcp__stitch__*`) לפני כתיבת קומפוננטים
2. **שינויי DB** → מיגרציה חדשה + הרצה עם `mcp__supabase__apply_migration`
3. **RLS** → כל שינוי schema חייב לעדכן policies בהתאם
4. **types/database.ts** → לעדכן ראשון בכל שינוי schema
5. **Server Actions** → `'use server'` בראש, תמיד לאמת role לפני פעולה
6. **Soft delete** → תמיד לסנן `.is('deleted_at', null)` בכל שאילתת SELECT על cases
7. **הוספת עמוד** → לעדכן navigation ב-`layout.tsx` לפי role

---

## 20. Supabase Region (הערה חשובה)

**הפרויקט הנוכחי אינו בפרנקפורט.** אי אפשר להעביר project קיים.
כדי לשפר latency עתידית: צור project חדש ב-`eu-central-1`, הרץ כל המיגרציות, עדכן `.env.local` + Vercel env vars.
