-- One row per (run, step) (code review 2026-10-13). The case and closure pages
-- create missing steps while rendering; with the 30-second auto refresh and
-- several people on one case, two renders could insert the same steps twice.
-- Checked before adding: 2,257 steps, 0 duplicate (run_id, step_key) pairs, and
-- every insert site creates a fresh set for a new run — nothing legitimate
-- inserts a step that already exists.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_case_workflow_steps_run_step
  ON public.case_workflow_steps (run_id, step_key);
