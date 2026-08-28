-- 036: Formal migration tracking — the actual fix for "which migrations
-- have already been run against production" being hard to answer, which is
-- what caused the numbering collisions cleaned up earlier (005/010/022/026/027
-- each had two different files).
--
-- Not a switch to the Supabase CLI's own migration system (that would mean
-- restructuring every existing file into its timestamped format and linking
-- the project — a much bigger, riskier change than this warrants right now).
-- Just one table + one convention: every migration's LAST statement inserts
-- its own filename here. Before running a new migration, check whether it's
-- already listed:
--   SELECT filename FROM schema_migrations ORDER BY filename;

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill for everything before this migration. Verified against the live
-- schema (2026-08-28) by spot-checking columns/tables from early, middle,
-- and late migrations across the sequence (013, 017, 021, 028) — all
-- present, which is strong evidence the full chain up to 035 already ran
-- (a later migration's ALTER/columns existing implies the earlier ones its
-- table depends on ran too). Not a per-file audit of all 35, though — if
-- any single one of these turns out NOT to have actually run, this backfill
-- will incorrectly claim it did. Worth a closer look if something in the
-- app starts erroring about a missing column/table from this list.
INSERT INTO schema_migrations (filename) VALUES
  ('001_init.sql'), ('002_storage.sql'), ('003_schema_align.sql'),
  ('004_seed_branches.sql'), ('005_case_documents.sql'), ('005b_verification_gaps.sql'),
  ('006_new_case_fields.sql'), ('007_new_parts_status.sql'), ('008_workflow_steps_update.sql'),
  ('009_settings_tables.sql'), ('010_fix_rls_ceo.sql'), ('010b_rls_case_workflow_fixes.sql'),
  ('011_fix_rls_workflow_steps_ceo.sql'), ('012_fix_ceo_rls_and_approval_config.sql'),
  ('013_feature_additions.sql'), ('014_performance_indexes.sql'), ('015_closure_checklist_state.sql'),
  ('016_appraiser_status.sql'), ('017_soft_delete_and_painter.sql'), ('018_fix_rls_recursion.sql'),
  ('019_ceo_bypass_profiles_audit.sql'), ('020_session6_feedback.sql'), ('021_push_subscriptions.sql'),
  ('022_push_subscription_update_policy.sql'), ('022b_storage_branch_scoped_rls.sql'),
  ('023_closure_workflow_uniqueness.sql'), ('024_security_hardening.sql'),
  ('025_perf_indexes_and_search_path.sql'), ('026_realtime_notifications.sql'),
  ('026b_fix_profiles_select_ceo_visibility.sql'), ('027_painter_checklist_timestamps.sql'),
  ('027b_ceo_receives_all_notifications.sql'), ('028_cross_branch_access.sql'),
  ('030_branch_recipients_fn.sql'), ('031_fanout_to_ceos_and_advisors.sql'),
  ('032_fanout_only_cross_branch_advisors.sql'), ('033_storage_cross_branch_access.sql'),
  ('034_painter_status_other.sql'), ('035_enter_work_reminder_tracking.sql')
ON CONFLICT (filename) DO NOTHING;

INSERT INTO schema_migrations (filename) VALUES ('036_migration_tracking.sql')
ON CONFLICT (filename) DO NOTHING;
