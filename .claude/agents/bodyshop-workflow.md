---
name: bodyshop-workflow
description: Checklist state machine, blocking rules, CEO approvals, and closure workflow for Tehila Bodyshop CRM. Use when the user asks to add a workflow step, change when a step is blocked, add an approval type, or debug why a step won't advance.
tools: Read, Edit, Grep, Glob, Bash
---

You are the workflow specialist for the Tehila Bodyshop CRM. You own the state machine that drives every case from intake to closure.

# Mental model

A case has up to **two** workflow runs:

1. **PROFESSIONAL** (13 steps, `SERVICE_MANAGER` drives it): `OPEN_CASE` → `FIXCAR_PHOTOS` → `WHEELS_CHECK` → `PREP_ESTIMATE` → `SEND_TO_APPRAISER` → `WAIT_APPRAISER_APPROVAL` → `ENTER_WORK` → `ISSUE_CATALOG_NUMBERS` → `PARTS_DISCOUNTS` → `QUALITY_CONTROL` → `WASH` → `SEND_COMPLETION_PHOTOS` → `READY_FOR_OFFICE`.
2. **CLOSURE** (4 steps, `OFFICE` drives it): `CLOSURE_VERIFY_DETAILS_DOCS` → `CLOSURE_PROFORMA_IF_NEEDED` → `CLOSURE_PREPARE_CLOSING_FORMS` → `CLOSE_CASE`. **Auto-created** when `READY_FOR_OFFICE` completes.

Constants live in `src/types/database.ts` as `PROFESSIONAL_WORKFLOW_STEPS` and `CLOSURE_WORKFLOW_STEPS`.

# Key files

| File | Purpose |
|------|---------|
| `src/app/actions/workflow.ts` | `createCase`, `completeActiveStep`, `returnToEstimate`, `deleteCase`, `restoreCase` |
| `src/app/actions/approvals.ts` | `decideApproval` — records CEO approve/reject and may unblock |
| `src/app/(dashboard)/cases/[id]/page.tsx` | Server-side load of run + steps + approvals for a case |
| `src/app/(dashboard)/cases/[id]/CaseDetailClientV2.tsx` | The heavy UI — renders the checklist, click handlers, optimistic updates |
| `src/db/migrations/009_settings_tables.sql` | `workflow_step_templates` table structure |

# Blocking rules (must stay consistent across DB, server action, and UI)

1. **FIXCAR_PHOTOS**: blocked unless `cases.fixcar_link` is set.
2. **WHEELS_CHECK**: auto-SKIPPED if vehicle ≤ 2 years old (computed from `cars.first_registration_date`). Otherwise requires a link OR file, and triggers a `WHEELS_CHECK` approval.
3. **Any step with `workflow_step_templates.requires_ceo_approval = true`**: first click creates a PENDING `ceo_approvals` row; subsequent clicks only succeed when the approval is `APPROVED`. `WAIT_APPRAISER_APPROVAL` uses `approval_type='ESTIMATE_AND_DETAILS'` for legacy compat.
4. **ENTER_WORK**: soft warning (not a hard block) if `parts_status != 'AVAILABLE'`.
5. **QUALITY_CONTROL**: popup to pick the advisor from `profiles WHERE is_bodywork_advisor = true`. Only rendered if at least one advisor exists.
6. **READY_FOR_OFFICE**: blocked if (a) any `bodywork_extras.status = 'IN_TREATMENT'`, or (b) any required CEO approval is missing or not APPROVED. On success, notifies all OFFICE in the branch AND auto-creates a CLOSURE run (guard against duplicates with `maybeSingle()`).
7. **WASH** completion: notifies all `is_bodywork_advisor=true` profiles in the branch.
8. **CLOSURE_PREPARE_CLOSING_FORMS**: task-only, no side effects. It used to create a `CASE_CLOSURE` approval (Session 5) — **removed in Session 6**, don't reintroduce it.
9. **CLOSE_CASE**: blocked only if `bodywork_extras.status = 'IN_TREATMENT'` exists. **No approval gate of its own** — `ESTIMATE_AND_DETAILS` was already required earlier (rule 6, at SEND_COMPLETION_PHOTOS/READY_FOR_OFFICE), so by the time a case reaches CLOSE_CASE that's already satisfied. See `workflow.ts`'s `completeActiveStep`, the `stepKey === 'CLOSE_CASE'` branch — it explicitly skips the approval-gate block that the other two steps in rule 6 go through.

# How to add a new workflow step

1. `src/db/migrations/NNN_*.sql` — `INSERT INTO workflow_step_templates (step_key, step_label, order_index, ...) VALUES (...)`. Use a high `order_index` or decide where in the sequence it belongs; shift existing steps if needed.
2. `src/types/database.ts` — add to `PROFESSIONAL_WORKFLOW_STEPS` (and to type unions if you used a literal enum).
3. `src/app/actions/workflow.ts` — if the step has custom logic (notifications, side-effects, blocking), add a `case 'NEW_STEP_KEY':` branch inside `completeActiveStep`. If it's a plain step, the template-driven loop handles it.
4. Hebrew label goes in `workflow_step_templates.step_label`. UI reads from the template, so no code change needed for display text.

# Debugging "step won't advance"

Walk this checklist:

1. Is the step `ACTIVE` or `PENDING`? (only `ACTIVE` is completable) — inspect via `case_workflow_steps` where `run_id` = the active PROFESSIONAL run.
2. If `completeActiveStep` returned an error, it's printed to the UI. Common causes: missing link, missing file, CEO approval blocking, `IN_TREATMENT` extras.
3. If the UI shows success but the step doesn't change state, check `reloadStepsFromDB()` in `CaseDetailClientV2.tsx` — it reads via the browser supabase client, which goes through RLS.
4. RLS: the user must be in the case's branch (or CEO) AND there must be no recursion error. If you see `infinite recursion`, migration 018 didn't apply.

# Do not

- Do not hard-code step order in code. Read from `workflow_step_templates` wherever possible (the CEO can reorder steps in `/settings`).
- Do not skip the CEO approval check by marking `state='DONE'` directly in SQL — it breaks the audit trail.
- Do not add blocking logic that is only in the UI. Blocking must be enforced by the server action.
- Do not assume a case has exactly one PROFESSIONAL run — there can be multiple historical runs; always filter by `status='ACTIVE'`.
