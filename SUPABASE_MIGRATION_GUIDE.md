> ✅ **בוצע** — לפי אישור סשה (2026-08-27), ההגירה הזו כבר הושלמה. הפרויקט
> הפעיל היום (`yhanmyvolpeiuxspcxmk`, המוגדר ב-`.env.local`/Vercel) הוא כבר
> פרויקט ה-eu-central-1. המדריך הזה נשאר כתיעוד היסטורי של איך זה בוצע.
>
> ℹ️ **עדכון 2026-09-01:** הוקם Supabase CLI מקומי מקושר לפרוד (CLAUDE.md סעיף 22).
> להגירת region עתידית עדיף `supabase db dump` + `supabase db push` על הפרויקט החדש
> במקום הדבקה ידנית של `setup_fresh.sql`. הסכמה כ-baseline: `supabase/migrations/20260901180001_remote_schema.sql`.

# מדריך הגירה: Supabase → eu-central-1 (פרנקפורט)

מטרה: להעביר את הפרויקט הקיים ל-Supabase באזור `eu-central-1` לשיפור latency מישראל.
מה שומרים: כל הנתונים, המשתמשים (כולל סיסמאות), תמונות, הרשאות, ו-workflow templates.

---

## דרישות מקדימות

- חשבון Supabase פעיל עם הפרויקט הקיים
- גישה ל-Vercel project לעדכון env vars
- טרמינל עם Node.js (כבר מותקן בפרויקט)

---

## שלב 1 — הכנת הסביבה המקומית

פתח טרמינל בתיקייה `/Users/sashadibka/amit-maymon-new/amit-maymon-new` ובדוק ש-node_modules מותקן:

```bash
npm install
```

---

## שלב 2 — יצירת פרויקט חדש ב-Supabase Dashboard

1. היכנס ל-https://supabase.com/dashboard
2. **New Project** → בחר organization
3. הגדרות:
   - **Name:** `tehila-bodyshop-eu` (או שם שתבחר)
   - **Region:** `Central EU (Frankfurt) — eu-central-1`
   - **Database password:** בחר סיסמה חזקה ושמור אותה ב-password manager — תדרש לזה בשלב 4
   - **Pricing plan:** Free או Pro לפי הצורך
4. לחץ **Create new project** וחכה ~2 דקות עד שהוא מוכן

---

## שלב 3 — יצירת buckets בפרויקט החדש

ב-Dashboard של הפרויקט החדש → **Storage**:

1. **New bucket** → שם: `extras-images` → **Private bucket** → Create
2. **New bucket** → שם: `painter-images` → **Private bucket** → Create
3. **New bucket** → שם: `case-documents` → **Private bucket** → Create

---

## שלב 4 — הרצת הסכמה בפרויקט החדש

1. ב-Dashboard של הפרויקט החדש → **SQL Editor** → **New query**
2. פתח את הקובץ `src/db/setup_fresh.sql` בעורך וחפש-החלף (Ctrl+F / Cmd+F בעריכה) — **לא דרוש** להחליף שום דבר
3. העתק את כל התוכן של `src/db/setup_fresh.sql`
4. הדבק ב-SQL Editor → **Run**
5. חכה לסיום (~10 שניות). אם יש שגיאה קלה כמו "already exists" — זה בסדר (ה-DDL מגונן עם `IF NOT EXISTS`).

---

## שלב 5 — איסוף ה-credentials

בכל אחד משני הפרויקטים (ישן וחדש) → **Project Settings → API**, העתק:

| ערך | מאיפה |
|-----|--------|
| `Project URL` | Settings → API → Project URL |
| `anon public` | Settings → API → Project API keys → anon public |
| `service_role` | Settings → API → Project API keys → service_role **(סודי!)** |

שמור את הכול זמנית בפתקית (תזרוק אותה אחרי ההגירה).

---

## שלב 6 — ייצוא משתמשי Auth מהפרויקט הישן

1. **בפרויקט הישן** → SQL Editor → New query
2. העתק את התוכן של `scripts/export-auth-users.sql` → הדבק → **Run**
3. תקבל טבלת תוצאה עם עמודה `sql` — לחץ על כל שורה ולחץ על החלון הפתוח כדי להעתיק את הטקסט המלא
   - **או** לחץ על **Download CSV** ואז פתח ב-Excel/TextEdit והעתק את כל עמודת `sql`
4. **בפרויקט החדש** → SQL Editor → New query → הדבק את כל ה-INSERT שקיבלת → **Run**
5. חזור על אותו תהליך עבור **החלק השני** של הקובץ — `auth.identities` (הוא כלול ב-`export-auth-users.sql` — זו השאילתה השנייה)

> אם יש לך בעיות עם "copy all rows" ב-SQL Editor, השתמש ב-`Download → CSV` ואז `awk -F',' '{print $1}' file.csv`.

---

## שלב 7 — העברת נתוני הטבלאות וה-storage

הרץ מהטרמינל (בתיקיית הפרויקט):

```bash
OLD_SUPABASE_URL="https://XXXXX-old.supabase.co" \
OLD_SERVICE_ROLE_KEY="eyJ...OLD_service_role..." \
NEW_SUPABASE_URL="https://YYYYY-new.supabase.co" \
NEW_SERVICE_ROLE_KEY="eyJ...NEW_service_role..." \
  node scripts/migrate-to-new-supabase.mjs
```

הסקריפט יעתיק:
- כל הטבלאות לפי סדר תלות (branches → profiles → cases → ...)
- כל קבצי ה-storage מ-3 ה-buckets

ההרצה לוקחת ~30 שניות למסד נתונים קטן + כמה שניות לכל 10 תמונות.

**אם משהו נכשל באמצע:** הסקריפט משתמש ב-`upsert` לפי `id` → בטוח להרצה חוזרת. פשוט הרץ שוב.

---

## שלב 8 — עדכון `.env.local`

צור/עדכן את הקובץ `.env.local` בתיקיית הפרויקט:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YYYYY-new.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...NEW_anon...
SUPABASE_SERVICE_ROLE_KEY=eyJ...NEW_service_role...
```

הרץ מקומית לבדיקה:

```bash
npm run dev
```

היכנס עם המשתמש של עמית → בדוק שהתיקים, ההתראות והתמונות מופיעים.

---

## שלב 9 — עדכון Vercel

### Option A: דרך Vercel Dashboard
1. vercel.com/dashboard → הפרויקט → **Settings → Environment Variables**
2. עדכן את שלושת הערכים:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. **Deployments → Redeploy** (בלי cache)

### Option B: דרך Vercel CLI
```bash
npm i -g vercel
vercel link  # אם לא מקושר
vercel env rm NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_URL production  # הדבק את הURL החדש
# חזור על השניים האחרים
vercel --prod
```

---

## שלב 10 — בדיקת קבלה (Smoke Test)

לאחר ה-deploy, נכנסים ל-production URL ובודקים:

- [ ] Login עם ceo@test.com / manager@test.com
- [ ] רשימת תיקים מופיעה מלאה
- [ ] פתיחת תיק → רואים את הצ'קליסט + פרטים
- [ ] תמונת bodywork_extras נטענת
- [ ] התראות מופיעות
- [ ] יצירת תיק חדש עובדת

---

## שלב 11 — ניקוי

אם הכל עובד לאחר 24–48 שעות:
- **Pause** את הפרויקט הישן ב-Supabase (לא למחוק עדיין)
- לאחר שבוע יציבות — אפשר למחוק את הפרויקט הישן

---

## טיפול בבעיות נפוצות

**שגיאה: "duplicate key value violates unique constraint"**
→ הטבלה כבר הוזרקה. הסקריפט עושה upsert, אבל אם יש conflict שלא על `id` ייתכן שצריך `TRUNCATE table CASCADE` לפני ההרצה החוזרת.

**שגיאה: "new row violates row-level security policy"**
→ service_role_key שגוי או שלא הוזרק נכון. בדוק ש-`SUPABASE_SERVICE_ROLE_KEY` הוא ה-`service_role` ולא ה-`anon`.

**המשתמשים לא יכולים להתחבר**
→ `auth.identities` לא יובא. חזור לשלב 6 וודא שהרצת גם את השאילתה השנייה בקובץ.

**תמונות לא נטענות**
→ buckets לא נוצרו בפרויקט החדש, או policies חסרות. בדוק ב-Storage שיש שלושת ה-buckets ושב-`setup_fresh.sql` רצו ה-policies.
