# Migrations — היסטוריה 001–046

> הועבר מ-CLAUDE.md ב-2026-10-14 (העתק מדויק, ללא שינוי תוכן). נקרא לפי צורך — לא נטען אוטומטית בכל סשן.

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

