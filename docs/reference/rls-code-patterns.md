# RLS, ארכיטקטורת קוד, נתיבי קבצים

> הועבר מ-CLAUDE.md ב-2026-10-14 (העתק מדויק, ללא שינוי תוכן). נקרא לפי צורך — לא נטען אוטומטית בכל סשן.

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

