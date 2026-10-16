-- Security review (16/10): any signed-in user could add a case-history event
-- with user_id NULL — an entry that looks like it came from the system. Every
-- write in the code passes the signed-in user's id (12 call sites checked),
-- and the last NULL row is from 27/08 (old import), so: own name only.
drop policy if exists audit_events_insert on public.audit_events;
create policy audit_events_insert on public.audit_events
  for insert to authenticated
  with check (user_id = (select auth.uid()));
