-- One OPEN case per car+claim per branch — not "one case ever".
--
-- Bug (2026-10-11, office): a case could not be opened for car 29169304 —
-- "כבר קיים תיק פתוח לרכב הזה" — yet nobody could see such a case. Its only
-- case had been DELETED on 07/10. The unique index on (branch_id, case_key)
-- also counted deleted and closed cases, so a deleted case blocked the car for
-- good, and a private customer (case_key = <plate>-PRIVATE) returning to the
-- same branch after their case was closed was blocked too.
--
-- Now the index covers only open, not-deleted cases. Idempotent.

DROP INDEX IF EXISTS public.idx_cases_case_key_branch;

CREATE UNIQUE INDEX idx_cases_case_key_branch
  ON public.cases USING btree (branch_id, case_key)
  WHERE case_key IS NOT NULL AND deleted_at IS NULL AND closed_at IS NULL;
