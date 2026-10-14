# Live Features + Critical Fixes ספטמבר 2026 (היסטוריה)

> הועבר מ-CLAUDE.md ב-2026-10-14 (העתק מדויק, ללא שינוי תוכן). נקרא לפי צורך — לא נטען אוטומטית בכל סשן.

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

