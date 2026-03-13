# סיכום שינויים - Tehila Bodyshop CRM
## תיעוד מלא של כל מה שנבנה

---

## גרסאות קודמות (Session 1)

### 1. שלבי סגירה (Closure Workflow)
- **`ClosureDetailClient.tsx`** — שמירת שלבים אחרי רענון דף
- **`workflow.ts`** — אישור CEO אוטומטי ב-`CLOSURE_PREPARE_CLOSING_FORMS`, חסימת `CLOSE_CASE`
- **`types/database.ts`** — הוספת `CASE_CLOSURE` ל-`ApprovalType`

### 2. ENTER_WORK — אזהרה במקום חסימה
- שלב ENTER_WORK לא חוסם יותר אם חלקים לא זמינים — מציג התראה בלבד

### 3. סטטוס חלקים — ללא איפוס
- הסרת `router.refresh()` מ-`savePartsStatus` — הצ'קליסט לא מתאפס

### 4. מסמכים לתיק
- **`case_documents`** — טבלה חדשה ב-DB + RLS
- **`documents.ts`** — server actions: `uploadCaseDocument`, `deleteCaseDocument`
- **`CaseDetailClientV2.tsx`** — UI העלאה + הצגה + מחיקה
- **`CreateCaseButton.tsx`** — העלאת קבצים בפתיחת תיק

### 5. תצוגת אישורים
- **`ApprovalsList.tsx`** — כפתור "צפה בתיק המלא", תמיכה ב-`CASE_CLOSURE`

### 6. Badge התראות
- **`NotificationsBadge.tsx`** — polling כל 10 שניות, browser notifications, PWA

### 7. עמודת "השלב הבא" בטבלת תיקים
- **`cases/page.tsx`** + **`CasesTable.tsx`** — טעינת workflow steps + תצוגת שלב פעיל

---

---

## Session 2 — השינויים הגדולים (commit: `fb98c56`)

---

### A. שדות חדשים בפתיחת תיק

**קובץ:** `src/app/(dashboard)/cases/CreateCaseButton.tsx`

| שדה | סוג | הערות |
|-----|-----|--------|
| `customer_name` | text | שם לקוח |
| `phone` | tel | טלפון |
| `insurance_company` | text | חברת ביטוח (חופשי, לא enum) |
| `appraiser_name` | text | שמאי |
| `vehicle_type` | text | סוג רכב |
| `vehicle_year` | number | שנת הרכב (1990–2026) |
| `event_date` | date | תאריך אירוע |
| `sub_claim_type` | select | פוליסה / צד ג' / הסדר ג' / תיקון פרטי / שלמה פוליסה / שלמה צד ג' |

- Modal הורחב (max-w-xl, overflow-y-auto, max-h-[90vh])
- CEO מורשה ליצור תיקים

---

### B. שינוי Workflow Steps (צ'קליסט)

**הוסר:** `SUMMARIZE_ESTIMATE`

**שם שונה:** `WHEELS_CHECK` → "טפסי גלגלים" (היה "בדיקת גלגלים")

**שם שונה:** `PREP_ESTIMATE` → "אומדן" (היה "הכנת אומדן")

**שלבים חדשים:**
| step_key | שם עברי | מיקום |
|----------|---------|--------|
| `ISSUE_CATALOG_NUMBERS` | ניפוק מק"טים | 7 |
| `PARTS_DISCOUNTS` | הנחות חלקים | 8 |
| `SEND_COMPLETION_PHOTOS` | שליחת תמונות לשמאי גמר תיקון | 11 |

**סדר סופי (13 שלבים):**
```
0  OPEN_CASE
1  FIXCAR_PHOTOS
2  WHEELS_CHECK
3  PREP_ESTIMATE
4  SEND_TO_APPRAISER
5  WAIT_APPRAISER_APPROVAL
6  ENTER_WORK
7  ISSUE_CATALOG_NUMBERS
8  PARTS_DISCOUNTS
9  QUALITY_CONTROL
10 WASH
11 SEND_COMPLETION_PHOTOS
12 READY_FOR_OFFICE
```

**לוגיקת WHEELS_CHECK (טפסי גלגלים):**
- רכב ≤ 2 שנים → שלב מדולג אוטומטית (SKIPPED)
- רכב > 2 שנים → פאנל פתיחה עם 2 tabs: "קישור" (URL) ו-"קובץ" (file upload)
- לאחר שמירה: קישור נשמר ב-`cases.wheels_check_link`, קובץ עולה ל-`case-documents`

**Steps נטענים מ-DB** (`workflow_step_templates`) עם fallback למערך hardcoded

---

### C. שדות חדשים בפרטי תיק

**קובץ:** `src/app/(dashboard)/cases/[id]/CaseDetailClientV2.tsx`

- תצוגת כל השדות החדשים בפאנל פרטים: שם לקוח, טלפון, חברת ביטוח, שמאי, תאריך אירוע, תת סוג תביעה, סוג רכב

---

### D. סטטוס חלקים חדש: AIRMAIL_PENDING

**קבצים:**
- `src/types/database.ts` — הוספת `'AIRMAIL_PENDING'` ל-`PartsStatus`
- `CaseDetailClientV2.tsx` — תצוגה "ממתין לדואר אוויר"
- `ApprovalsList.tsx` — תצוגה בפאנל אישורים

---

### E. שדרוג דשבורד — 5 כרטיסי סטטיסטיקה

**קובץ:** `src/app/(dashboard)/cases/page.tsx`

| כרטיס | צבע | לוגיקה |
|-------|-----|---------|
| סה"כ תיקים פתוחים | כחול | `general_status = ACTIVE` |
| רכבים בעבודה | ירוק | שלב פעיל ≥ `ENTER_WORK` (order_index ≥ 6) |
| ממתינים לחלקים | צהוב | `parts_status IN ('ORDERED', 'NO_PARTS')` |
| ממתין לדואר אוויר | סגול | `parts_status = 'AIRMAIL_PENDING'` |
| ממתינים למוסך | אפור | שלב פעיל < `ENTER_WORK` (order_index < 6) |

---

### F. ציר זמן — ייחוס משתמש

**קבצים:** `page.tsx` + `CaseDetailClientV2.tsx`

- אחרי טעינת audit_events: אוסף `user_id` ייחודיים
- שולף `profiles.full_name` לכל ה-IDs
- ציר הזמן מציג: "בוצע על ידי: [שם]"

---

### G. עמוד הגדרות (CEO בלבד)

**קבצים חדשים:**
- `src/app/(dashboard)/settings/page.tsx`
- `src/app/(dashboard)/settings/PermissionsTab.tsx`
- `src/app/(dashboard)/settings/ChecklistTab.tsx`
- `src/app/actions/settings.ts`

#### טאב הרשאות (PermissionsTab):
- מטריצת roles × actions
- Checkbox לכל צלב (שמירה מיידית)
- CEO נעול — לא ניתן לשנות

**Roles:** SERVICE_MANAGER, OFFICE, CEO, PAINTER, SERVICE_ADVISOR

**Actions:**
| action | תיאור |
|--------|--------|
| `create_case` | פתיחת תיק |
| `complete_professional_step` | השלמת שלב מקצועי |
| `complete_closure_step` | השלמת שלב סגירה |
| `manage_settings` | ניהול הגדרות |
| `decide_approvals` | אישור/דחיית אישורים |
| `manage_extras_status` | ניהול תוספות |
| `upload_documents` | העלאת מסמכים |
| `delete_documents` | מחיקת מסמכים |

#### טאב צ'קליסט (ChecklistTab):
- רשימת שלבי workflow הניתנת לעריכה
- הפעלה/השבתה של כל שלב
- עריכת שם שלב
- הוספת שלב חדש
- מחיקת שלב (מלבד OPEN_CASE ו-READY_FOR_OFFICE)

**Server Actions (`settings.ts`):**
```typescript
getRolePermissions()
updateRolePermission(role, action, enabled)
getWorkflowStepTemplates()
updateWorkflowStep(id, updates)
addWorkflowStep(step)
removeWorkflowStep(id)
```

---

### H. הרשאות CEO מלאות

**קובץ:** `src/app/actions/workflow.ts`

- `createCase` — CEO מורשה
- `completeActiveStep` — CEO מורשה לסיים שלבים מקצועיים וסגירה
- `returnToEstimate` — CEO מורשה

**קובץ:** `CaseDetailClientV2.tsx`
- `canEdit` — כולל CEO
- `canManageExtras` — כולל CEO

---

### I. DB Migrations (006–009)

**קובץ:** `src/db/run_all_migrations.sql` — סקריפט מאוחד להרצה ב-Supabase

| Migration | תיאור |
|-----------|--------|
| **006** | שדות חדשים בתיק: `customer_name, phone, insurance_company, appraiser_name, event_date, wheels_check_link, sub_claim_type`; שדה `vehicle_type` לרכב |
| **007** | `ALTER TYPE parts_status ADD VALUE 'AIRMAIL_PENDING'` |
| **008** | מחיקת SUMMARIZE_ESTIMATE, הוספת 3 שלבים חדשים, עדכון `order_index` |
| **009** | טבלאות `role_permissions` + `workflow_step_templates` + Seed data + RLS |

**CEO Test User** (נוצר ב-run_all_migrations.sql):
- email: `ceo@test.com`
- password: `TestCEO123!`

---

### J. TypeScript Types עודכנו

**קובץ:** `src/types/database.ts`

```typescript
// עודכן
export type PartsStatus = 'NO_PARTS' | 'ORDERED' | 'AVAILABLE' | 'AIRMAIL_PENDING';

// חדש
export type SubClaimType = 'POLICY' | 'THIRD_PARTY' | 'THIRD_PARTY_SETTLEMENT'
  | 'PRIVATE_REPAIR' | 'SHLOMO_POLICY' | 'SHLOMO_THIRD_PARTY';

// עודכן — הוסר SUMMARIZE_ESTIMATE, נוספו 3 חדשים
export const PROFESSIONAL_WORKFLOW_STEPS = [
  'OPEN_CASE', 'FIXCAR_PHOTOS', 'WHEELS_CHECK', 'PREP_ESTIMATE',
  'SEND_TO_APPRAISER', 'WAIT_APPRAISER_APPROVAL', 'ENTER_WORK',
  'ISSUE_CATALOG_NUMBERS', 'PARTS_DISCOUNTS',
  'QUALITY_CONTROL', 'WASH', 'SEND_COMPLETION_PHOTOS', 'READY_FOR_OFFICE',
] as const;

// חדש
export interface RolePermission { id, role, action, enabled }
export interface WorkflowStepTemplate { id, step_key, step_label, order_index, is_enabled, requires_link, requires_file_or_link }

// עודכן
export interface CreateCaseInput {
  // ... + customer_name, phone, insurance_company, appraiser_name,
  //         event_date, vehicle_type, vehicle_year, sub_claim_type
}
```

---

---

## Session 3 — תיקוני Bugs ו-Vercel (commits: `0ac1595` עד `fb0dc91`)

---

### 1. Vercel Auto-Deploy — GitHub Actions

**בעיה:** GitHub App webhook לא עבד, Vercel לא קיבל push events

**פתרון:**
- **`.github/workflows/deploy.yml`** — GitHub Actions workflow:
  ```yaml
  on:
    push:
      branches: [main]
  jobs:
    deploy:
      uses: amondnet/vercel-action@v25
      with:
        vercel-args: '--prod'
  ```
- GitHub Secrets הוגדרו: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- כל push ל-`main` מפעיל deploy אוטומטי

---

### 2. Conditional Inserts — מניעת Schema Cache Errors

**קובץ:** `src/app/actions/workflow.ts`

**בעיה:** שדות חדשים (migration 006) גרמו לשגיאות כשה-DB לא עדכן עדיין

**פתרון:** כל שדה חדש נשלח רק אם לא `null`:
```typescript
// Car INSERT
...(input.vehicle_type != null ? { vehicle_type: input.vehicle_type } : {}),
...(input.vehicle_year != null ? { year: input.vehicle_year } : {}),

// Case INSERT
...(input.sub_claim_type != null ? { sub_claim_type: input.sub_claim_type } : {}),
...(input.customer_name != null ? { customer_name: input.customer_name } : {}),
// ...וכן הלאה
```

---

### 3. Resilient Case SELECT — Fallback Pattern

**קובץ:** `src/app/(dashboard)/cases/[id]/page.tsx`

**בעיה:** SELECT עם עמודות חדשות נכשל אם migration 006 לא הורץ

**פתרון:** try/fallback:
```typescript
let caseRow: unknown = null;
{
  const { data, error } = await supabase.from('cases').select('...full columns...').eq('id', id).single();
  if (error) {
    const { data: basicData } = await supabase.from('cases').select('...stable columns...').eq('id', id).single();
    caseRow = basicData;
  } else {
    caseRow = data;
  }
}
```

---

### 4. revalidatePath — עדכון UI אחרי פעולות

**קובץ:** `src/app/actions/workflow.ts`

**בעיה:** אחרי השלמת שלב, ה-UI לא התעדכן

**פתרון:**
```typescript
// בסוף completeActiveStep:
revalidatePath(`/cases/${caseId}`);
revalidatePath('/cases');

// בסוף createCase:
revalidatePath('/cases');
```

---

### 5. Fix RLS — CEO יכול לפתוח תיקים

**קובץ:** `src/db/migrations/010_fix_rls_ceo.sql`

**בעיה:** CEO עם `branch_id = null` חסום על ידי INSERT policies של `cars` ו-`cases`

**פתרון:** הוספת CEO bypass לכל policy:
```sql
DROP POLICY IF EXISTS cars_insert ON cars;
CREATE POLICY cars_insert ON cars FOR INSERT TO authenticated
  WITH CHECK (
    branch_id IN (SELECT branch_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
  );
-- גם: cars_update, cases_insert
```

> **⚠️ חשוב:** להריץ SQL זה ב-Supabase Dashboard → SQL Editor!

---

### 6. מסמכים בפאנל אישורים CEO

**קובץ:** `src/app/(dashboard)/approvals/ApprovalsList.tsx`

**תכונה:** כשמנהל (CEO) בוחר אישור, הוא רואה את כל המסמכים שהועלו לאותו תיק

**מה נוסף:**
- `DocumentDownloadButton` — כפתור הורדה עם Signed URL
- `useEffect` שטוען מסמכים מ-`case_documents` כשהבחירה משתנה
- רשימת מסמכים עם אייקונים (🖼️/📄/📎) + אפשרות הורדה
- אם אין מסמכים — הודעה "אין מסמכים מועלים לתיק זה"

---

---

## Session 4 — תיעוד שינויים (Cursor/Claude)

תיעוד כל השינויים שבוצעו בסשנים האחרונים: תיקוני RLS, UX, לוגו, אישורים, וסגירה ל-CEO.

---

### 1. תיקון RLS — יצירת תיק ושלבי workflow (מיגרציה 010)

**בעיה:** שגיאה "new row violates row-level security policy for table case_workflow_runs" בפתיחת תיק.

**קבצים:**
- `src/db/migrations/010_rls_case_workflow_fixes.sql`
- `RUN_IN_SUPABASE.sql` (בשורש — להרצה ידנית ב-SQL Editor)

**מה נוסף:**
- **case_workflow_runs_insert_creator** — INSERT מותר כשהתיק נוצר על ידי המשתמש (`created_by = auth.uid()`).
- **case_workflow_runs_update_ceo** — CEO יכול לעדכן `case_workflow_runs`.
- **case_workflow_steps_update_ceo** — CEO יכול לעדכן `case_workflow_steps`.

**הרצה:** Supabase → SQL Editor → להדביק את תוכן `RUN_IN_SUPABASE.sql` (או את מיגרציה 010) → Run.

---

### 2. צ'קליסט עבודה — סימון "בוצע" מתעדכן

**בעיה:** אחרי "סמן בוצע" ה-UI לא הציג את השלב כ-DONE.

**קובץ:** `src/app/(dashboard)/cases/[id]/CaseDetailClientV2.tsx`

**פתרון:**
- סנכרון `localSteps` עם `steps` מהשרת אחרי `router.refresh()`.
- עדכון אופטימי: מיד אחרי הצלחת `completeActiveStep` השלב מסומן כ-DONE בממשק, ואז רענון מהשרת.
- אם מהשרת חוזרים שלבים ריקים (בגלל run_id וכו') — לא לדרוס את השלבים שנשלחו בדף (לא לעדכן לריק).

---

### 3. תיקים חדשים — "אין שלבים להצגה"

**בעיה:** בתיק חדש הצ'קליסט היה ריק.

**קובץ:** `src/app/(dashboard)/cases/[id]/page.tsx`

**פתרון:**
- אם יש run אבל אין שלבים — יצירת שלבים אוטומטית מטבלת `workflow_step_templates` (או מ-`PROFESSIONAL_WORKFLOW_STEPS` אם אין טמפלייטים). רץ גם ב-production (לא רק preview).
- טעינת שלבים לפי `case_id` (דרך כל ה-runs) ולא רק לפי run פעיל, כדי למצוא שלבים גם כשמשתנה run_id.

---

### 4. אישור CEO — התיק מופיע במסך האישורים

**בעיה:** כשנדרש אישור עמית, התיק לא הופיע ב"אישורים".

**קובץ:** `src/app/actions/workflow.ts`

**פתרון:**
- ב-`completeActiveStep`, כשמגיעים ל-**READY_FOR_OFFICE** (או CLOSE_CASE) וחסר אישור אומדן/גלגלים — יוצרים רשומות `ceo_approvals` במצב PENDING (ESTIMATE_AND_DETAILS, WHEELS_CHECK אם רלוונטי), כדי שהתיק יופיע במסך האישורים.
- חסימה רק בשלבים READY_FOR_OFFICE ו-CLOSE_CASE — לא בשלבים ביניים שדורשים אישור (למשל WAIT_APPRAISER_APPROVAL). בשלבים כאלה רק נוצרת רשומת אישור; המשתמש יכול להמשיך לשלב הבא.

---

### 5. לוגיקת אישור עמית — חסימה רק בסגירה

**החלטה:** אפשר להתקדם בין כל השלבים; אי אפשר לסגור תיק (או "מוכן למשרד") בלי שעמית יאשר.

**קובץ:** `src/app/actions/workflow.ts`

- שלבים עם `requires_ceo_approval` (למשל WAIT_APPRAISER_APPROVAL): רק יוצרים רשומת PENDING באישורים, **לא** חוסמים סימון השלב כ-DONE.
- חסימה רק ב-**READY_FOR_OFFICE** ו-**CLOSE_CASE**: תוספות IN_TREATMENT או אישורי CEO חסרים/נדחים → return error.

**קובץ:** `src/app/(dashboard)/cases/[id]/CaseDetailClientV2.tsx`

- הוסרה חסימת "סמן בוצע" לשלבים עם `requires_ceo_approval`.
- נשארה חסימה רק ל-**READY_FOR_OFFICE** (תוספות בטיפול / נדרש אישור CEO).

---

### 6. מסך כניסה ו־Header — לוגו והפניה

**קבצים:**
- `src/components/Logo.tsx` — קומפוננטת לוגו: תמונה מ-`/logo.png` או טקסט "תהילה" ב-fallback.
- `src/app/login/page.tsx` — שימוש ב-`<Logo variant="login" />`.
- `src/app/(dashboard)/layout.tsx` — שימוש ב-`<Logo variant="header" />`.
- `src/app/page.tsx` — דף הבית מפנה ל-`/login` (אין תוכן ביניים).
- `middleware.ts` — כניסה ל-`/` מפנה ישירות ל-`/login` (לא preview).

**תוצאה:** כניסה לאתר מובילה ישר להתחברות; לוגו במסך כניסה וב-header. אם יש `public/logo.png` הוא מוצג; אחרת מוצג "תהילה".

---

### 7. טעינה ו־Loading

**קבצים:**
- `src/app/(dashboard)/loading.tsx` — ספינר "טוען..." בדשבורד.
- `src/app/(dashboard)/cases/[id]/loading.tsx` — ספינר בדף פרטי תיק.

Next.js משתמש בהם אוטומטית (Streaming) במעבר בין דפים.

---

### 8. התראות ו־Header

**קובץ:** `src/app/(dashboard)/layout.tsx`

- קישור **"התראות"** ב-header (ליד שם המשתמש) — מוביל ל-`/notifications`.
- באג' אדום עם מספר ההתראות על הקישור.

---

### 9. אישורי עמית — לינקים, קבצים, עדכון אופטימי

**קבצים:** `src/app/(dashboard)/approvals/page.tsx`, `ApprovalsList.tsx`, `src/app/actions/approvals.ts`

**תכונות:**
- בלוק **"לינקים וקבצים מצורפים"**: קישור FixCar, קישור טפסי גלגלים (`wheels_check_link`).
- **מסמכים שהועלו לתיק** (כולל מהצ'קליסט) — רשימה + כפתור הורדה.
- **עדכון אופטימי:** לחיצה על "אשר" או "דחה" מעדכנת את הרשימה מיד (האישור נעלם), ושמירה ל-DB רצה ברקע. אם יש שגיאה — הודעת שגיאה ו-`router.refresh()`.
- `revalidatePath('/approvals')` ו-`revalidatePath` לדף התיק אחרי אישור/דחייה.

---

### 10. הסרת "תאריך עלייה לכביש" מפתיחת תיק

**קבצים:**
- `src/app/(dashboard)/cases/CreateCaseButton.tsx` — השדה הוסר מהטופס (state, UI, submit).
- `src/app/actions/workflow.ts` — `first_registration_date` אופציונלי; אם לא נשלח משתמשים ב-`null` ב-car insert/update.
- `src/types/database.ts` — `CreateCaseInput.first_registration_date` הפך ל-`string | null` אופציונלי.

**השפעה:** אם לא מזינים תאריך — גיל הרכב לא מחושב; שלב WHEELS_CHECK לא ידולג אוטומטית (יישאר פעיל).

---

### 11. CEO — גישה לסגירת תיקים

**קובץ:** `src/app/(dashboard)/layout.tsx`

- בתפריט של **CEO** נוסף קישור **"סגירה"** (`/closure`) — כמו לאילנה (OFFICE).
- דף הסגירה כבר אפשר גישה ל-CEO (`profile?.role !== 'OFFICE' && profile?.role !== 'CEO'`); CEO רואה תיקים מכל הסניפים (ללא סינון branch).

---

### 12. מיגרציה 012 — RLS ל-CEO ו־requires_ceo_approval

**קובץ:** `src/db/migrations/012_fix_ceo_rls_and_approval_config.sql`

- **case_workflow_runs INSERT:** CEO או תיק בסניף של המשתמש.
- **ceo_approvals INSERT:** CEO או תיק בסניף של המשתמש.
- שדה **requires_ceo_approval** ב-`workflow_step_templates` (ברירת מחדל FALSE).
- עדכון: `WAIT_APPRAISER_APPROVAL` עם `requires_ceo_approval = TRUE`.

---

### 13. משתמש טסט SERVICE_MANAGER

**קובץ:** `CREATE_SERVICE_MANAGER_USER.sql` (בשורש)

- הרצה ב-Supabase SQL Editor יוצרת משתמש טסט: **manager@test.com** / **TestManager123!**
- תפקיד: SERVICE_MANAGER, משויך לסניף ראשון ב-`branches`.

---

### קבצים שנוצרו/שונו — Session 4

| קובץ | שינוי |
|------|--------|
| `RUN_IN_SUPABASE.sql` | סקריפט להרצת תיקוני RLS ב-Supabase |
| `CREATE_SERVICE_MANAGER_USER.sql` | יצירת משתמש טסט מנהל שירות |
| `src/db/migrations/010_rls_case_workflow_fixes.sql` | RLS ל-case_workflow_runs ו-case_workflow_steps |
| `src/db/migrations/012_fix_ceo_rls_and_approval_config.sql` | RLS ל-CEO + requires_ceo_approval |
| `src/components/Logo.tsx` | קומפוננטת לוגו (תמונה או טקסט) |
| `src/app/(dashboard)/loading.tsx` | טעינה לדשבורד |
| `src/app/(dashboard)/cases/[id]/loading.tsx` | טעינה לדף תיק |
| `src/app/(dashboard)/cases/[id]/page.tsx` | יצירת שלבים חסרים, טעינת requires_ceo_approval |
| `src/app/(dashboard)/cases/[id]/CaseDetailClientV2.tsx` | סנכרון שלבים, אופטימי, חסימה רק READY_FOR_OFFICE |
| `src/app/(dashboard)/cases/CreateCaseButton.tsx` | הסרת תאריך עלייה לכביש |
| `src/app/(dashboard)/layout.tsx` | לוגו, קישור התראות, סגירה ל-CEO |
| `src/app/(dashboard)/approvals/page.tsx` | wheels_check_link בשאילתה |
| `src/app/(dashboard)/approvals/ApprovalsList.tsx` | לינקים/קבצים, עדכון אופטימי לאישורים |
| `src/app/actions/workflow.ts` | יצירת אישורים חסרים, first_registration_date אופציונלי, לוגיקת חסימה רק בסגירה |
| `src/app/actions/approvals.ts` | revalidatePath אחרי החלטה |
| `src/app/login/page.tsx` | לוגו במסך כניסה |
| `src/app/page.tsx` | הפניה ל-/login |
| `middleware.ts` | הפניית / ל-/login |
| `src/types/database.ts` | first_registration_date אופציונלי ב-CreateCaseInput |

---

### Git Commits — Session 4 (דוגמאות)

```
c7f9277  RUN_IN_SUPABASE.sql, מיגרציה 010, צ'קליסט + loading
a0d35c6  fix: create CEO approval rows when missing so case appears in approvals screen
28c65cb  feat: checklist for new cases, approvals links/files, notifications in header
a17ec6a  feat: redirect / to login, Logo component, CEO approval only blocks closure
e1872c4  feat: remove תאריך עלייה from new case form, optimistic approvals, CEO closure link
```

---

## סיכום קבצים שנוצרו/שונו — Session 2+3

### קבצים חדשים:
| קובץ | תיאור |
|------|--------|
| `src/app/(dashboard)/settings/page.tsx` | עמוד הגדרות (CEO only) |
| `src/app/(dashboard)/settings/PermissionsTab.tsx` | ניהול הרשאות |
| `src/app/(dashboard)/settings/ChecklistTab.tsx` | ניהול שלבי workflow |
| `src/app/actions/settings.ts` | Server actions לניהול הגדרות |
| `src/db/migrations/006_new_case_fields.sql` | שדות חדשים בתיק + enum |
| `src/db/migrations/007_new_parts_status.sql` | AIRMAIL_PENDING |
| `src/db/migrations/008_workflow_steps_update.sql` | עדכון workflow steps |
| `src/db/migrations/009_settings_tables.sql` | טבלאות הגדרות |
| `src/db/migrations/010_fix_rls_ceo.sql` | תיקון RLS ל-CEO |
| `src/db/run_all_migrations.sql` | סקריפט מאוחד (006–010 + CEO user) |
| `.github/workflows/deploy.yml` | GitHub Actions CI/CD |

### קבצים שעודכנו:
| קובץ | שינויים עיקריים |
|------|----------------|
| `src/types/database.ts` | SubClaimType, AIRMAIL_PENDING, workflow steps, interfaces חדשים |
| `src/app/actions/workflow.ts` | conditional inserts, CEO permissions, revalidatePath |
| `src/app/(dashboard)/cases/CreateCaseButton.tsx` | 8 שדות חדשים, modal גדול יותר |
| `src/app/(dashboard)/cases/[id]/CaseDetailClientV2.tsx` | labels חדשים, WHEELS_CHECK panel, timeline user, CEO permissions |
| `src/app/(dashboard)/cases/[id]/page.tsx` | fallback SELECT, userNames, stepTemplates |
| `src/app/(dashboard)/cases/page.tsx` | 5 כרטיסי דשבורד חדשים |
| `src/app/(dashboard)/layout.tsx` | קישור "הגדרות" ל-CEO |
| `src/app/(dashboard)/approvals/ApprovalsList.tsx` | מסמכי תיק, DocumentDownloadButton |

---

## Git Commits (כרונולוגי)

```
c5a2063  Initial commit
fb98c56  feat: major CRM update - new fields, workflow steps, settings, dashboard
...
fb0dc91  Fix step revalidation, CEO RLS, and add documents to approvals panel
c7f9277  RUN_IN_SUPABASE.sql, מיגרציה 010, צ'קליסט + loading
a0d35c6  fix: create CEO approval rows when missing so case appears in approvals screen
28c65cb  feat: checklist for new cases, approvals links/files, notifications in header
a17ec6a  feat: redirect / to login, Logo component, CEO approval only blocks closure
e1872c4  feat: remove תאריך עלייה from new case form, optimistic approvals, CEO closure link
```

---

## מה צריך עדיין לעשות ב-Supabase

```sql
-- הרץ את כל זה ב-Supabase Dashboard → SQL Editor:
-- (הכל נמצא ב: src/db/run_all_migrations.sql)

-- 1. Migration 006-009 (אם לא הרצת עדיין)
-- 2. Migration 010 — תיקון RLS ל-CEO (חשוב לפתיחת תיקים כ-CEO!)
-- 3. CEO test user נוצר אוטומטית: ceo@test.com / TestCEO123!
```

---

## הרשאות Default (נשמרות ב-DB)

| פעולה | SERVICE_MANAGER | OFFICE | CEO | PAINTER | SERVICE_ADVISOR |
|-------|:-:|:-:|:-:|:-:|:-:|
| create_case | ✅ | ✅ | ✅ | ❌ | ❌ |
| complete_professional_step | ✅ | ❌ | ✅ | ❌ | ❌ |
| complete_closure_step | ❌ | ✅ | ✅ | ❌ | ❌ |
| manage_settings | ❌ | ❌ | ✅ | ❌ | ❌ |
| decide_approvals | ❌ | ❌ | ✅ | ❌ | ❌ |
| manage_extras_status | ✅ | ❌ | ✅ | ❌ | ❌ |
| upload_documents | ✅ | ✅ | ✅ | ❌ | ❌ |
| delete_documents | ✅ | ✅ | ✅ | ❌ | ❌ |
