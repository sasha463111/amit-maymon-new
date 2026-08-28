# Tehila Bodyshop CRM

Next.js + Supabase CRM for bodyshop repair workflow (intake to closure).

## Setup

### 1. Supabase Project

1. Create a [Supabase](https://supabase.com) project.
2. In **Authentication → Providers**: enable **Email** (Email + Password).
3. In **Storage**: create a bucket named **extras-images**, set to **Private**.
4. In **SQL Editor**: run every file under `src/db/migrations/` in filename
   order (`001_...`, `002_...`, etc. — a couple of numbers have an extra `b`
   file alongside them, e.g. `010_...` and `010b_...`; run both). Before
   running one against an existing (non-fresh) database, check whether it's
   already applied: `SELECT filename FROM schema_migrations ORDER BY filename;`
   (from migration 036 onward — every migration inserts its own filename
   there as its last step, so this is the source of truth for what's
   actually run, not the filenames on disk).

### 2. Environment

Copy `.env.example` to `.env.local` and fill in every value there — it's kept
up to date as the source of truth for what's actually required (see
`VERCEL_DEPLOY.md` for the full production list, including secrets).

- **anon key** is safe for client-side (browser). Use it in Next.js for Supabase client.
- **service_role key**: only for server-side admin tasks if needed; do not expose to the client.
- Push notifications and email-only login won't work locally without the VAPID keys / `EMAIL_ONLY_LOGIN_PASSWORD` — ask whoever manages prod for the current values.

### 3. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Seed users (optional)

Create users in Supabase Dashboard → Authentication → Users (email + password). Then in SQL Editor insert profiles:

```sql
-- Replace USER_ID with each auth user id from Dashboard
INSERT INTO profiles (id, full_name, role, branch_id)
VALUES
  ('USER_ID_ERAN', 'ערן', 'SERVICE_MANAGER', (SELECT id FROM branches WHERE name = 'NETIVOT' LIMIT 1)),
  ('USER_ID_ILANA', 'אילנה', 'OFFICE', (SELECT id FROM branches WHERE name = 'NETIVOT' LIMIT 1)),
  ('USER_ID_AMIT', 'עמית', 'CEO', NULL),
  ('USER_ID_AREZ', 'ארז', 'PAINTER', (SELECT id FROM branches WHERE name = 'NETIVOT' LIMIT 1)),
  ('USER_ID_KINERET', 'כנרת', 'SERVICE_ADVISOR', (SELECT id FROM branches WHERE name = 'NETIVOT' LIMIT 1));
```

## Docs

- [SPEC.md](SPEC.md) — technical spec
- [BUSINESS_PROCESS.md](BUSINESS_PROCESS.md) — business process (one page)
