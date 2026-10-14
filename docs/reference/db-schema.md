# DB Schema + Storage Buckets

> הועבר מ-CLAUDE.md ב-2026-10-14 (העתק מדויק, ללא שינוי תוכן). נקרא לפי צורך — לא נטען אוטומטית בכל סשן.

## 9. DB Schema — טבלאות עיקריות

### `cases` — תיק תיקון
| עמודה | סוג | הערות |
|-------|-----|-------|
| `id` | uuid PK | |
| `branch_id` | uuid FK→branches | |
| `car_id` | uuid FK→cars | |
| `case_key` | text | `{plate}-{claim\|\|PRIVATE}`. ייחודי ל-(סניף, case_key) **רק בתיקים פתוחים ולא מחוקים** (`idx_cases_case_key_branch`, מיגרציה `20261011120000`, 2026-10-11) — קודם גם תיק מחוק/סגור חסם פתיחת תיק חדש לאותו רכב |
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
- `important_notes` (2026-09-30) — הערות חשובות נעוצות: תיבה צהובה בראש עמוד ההפנייה + שורת ⚠️ בכרטיס ברשימה. נפרד מיומן המעקב (`referral_status_updates`), שהוא היסטוריה ולא אזהרה קבועה. **עוברת לתיק בהמרה:** `convertReferral()` מוסיפה אותה בראש `cases.notes` תחת הכותרת "⚠️ הערות חשובות מההפנייה:" (בלי כפילות; כשל בהעתקה נרשם ללוג ולא מבטל את ההמרה)

### `referral_status_updates` (042) — יומן מעקב הפניה
- `referral_id`, `status_tag` (AWAITING_REPLACEMENT_CAR/AWAITING_PAPERWORK/AWAITING_SCHEDULING/OTHER), `note`, `created_by`, `created_at`

### `referral_documents`
- `referral_id`, `file_name`, `file_path` (bucket: `referral-documents`), `file_size`, `mime_type`, `uploaded_by`

### `case_documents`
- `case_id`, `file_name`, `file_path`, `file_size`, `mime_type`, `document_type`, `uploaded_by`

### `role_permissions`
- `role`, `action`, `enabled` — מטריצת הרשאות דינמית. **מקור האמת היחיד** להרשאות (2026-09-18). ראה Standing Rule #5.
- 5 תפקידים × 9 פעולות = 45 שורות. הטבלה חייבת להישאר מלאה: שילוב חסר נחשב **אסור**.
- נקראת אך ורק דרך `has_permission(action)` — לא לשאול את הטבלה ישירות בקוד.

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

