# Standing Rules #5 ו-#6 — הרשאות ובדיקת RLS (הנוסח המקורי)

> הועבר מ-CLAUDE.md ב-2026-10-14 (העתק מדויק, ללא שינוי תוכן). נקרא לפי צורך — לא נטען אוטומטית בכל סשן.

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

