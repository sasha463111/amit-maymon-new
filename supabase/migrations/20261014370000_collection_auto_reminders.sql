-- Automatic stage reminders (Amit, 2026-10-14): moving a claim to a stage
-- sets a reminder for its collector (e.g. "ממתין לדוח שמאי" → in 7 days).
-- auto_stage marks those rows, so the next stage change closes the old one.
alter table public.collection_case_events add column if not exists auto_stage text;
create index if not exists collection_case_events_auto_open
  on public.collection_case_events (case_id)
  where auto_stage is not null and remind_done_at is null;
