-- Bugs / features boards (Tomer, 15/10): every request is tagged by the
-- person who opens it — BUG ("משהו לא עובד") or FEATURE ("משהו חדש / שיפור") —
-- and lands on the matching page (/bugs, /features). Tomer & Amit manage
-- them there: status, priority (1 = high … 3 = low), re-tagging.
-- Applied via MCP apply_migration (name: app_requests_kind_priority).
alter table public.app_requests add column if not exists kind text check (kind in ('BUG', 'FEATURE'));
alter table public.app_requests add column if not exists priority smallint check (priority between 1 and 3);
create index if not exists app_requests_kind_status on public.app_requests (kind, status, updated_at desc);
