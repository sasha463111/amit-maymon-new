-- 023: Prevent CLOSURE workflow race.
-- Two concurrent SEND_COMPLETION_PHOTOS completions could both pass the
-- "does a closure run already exist?" check and create duplicates, breaking
-- the .single() that runs right after. Partial unique index makes the second
-- concurrent INSERT fail cleanly with 23505 instead, which the calling code
-- in src/app/actions/workflow.ts treats as a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_case_workflow_runs_one_closure_per_case
  ON public.case_workflow_runs (case_id)
  WHERE workflow_type = 'CLOSURE';
