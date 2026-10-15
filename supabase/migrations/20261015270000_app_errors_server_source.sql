-- #9 / #43 (15/10): server code reports its own failures to the error monitor
-- (first: the sticker reader), with the file that shows the failure.
alter table public.app_errors drop constraint if exists app_errors_source_check;
alter table public.app_errors add constraint app_errors_source_check check (source in ('boundary', 'window', 'promise', 'server'));
alter table public.app_errors add column if not exists attachment text;
