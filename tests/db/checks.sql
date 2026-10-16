-- #42 (16/10): database checks — the protections that live in Postgres itself.
-- Everything runs inside ONE transaction that is rolled back: no real data is
-- changed. A failed check raises an exception (non-zero exit).
-- Run: npm run test:db   (supabase db query --linked -f tests/db/checks.sql)

begin;

do $$
declare
  v_fleet uuid;
  v_req uuid;
  n int;
begin
  ---------------------------------------------------------------- loaner handover
  -- A fleet car can't be handed over twice while it is out.
  select f.id into v_fleet from public.loaner_fleet f
   where f.active and not exists (select 1 from public.loaner_handovers h where h.fleet_id = f.id and h.returned_at is null) limit 1;
  if v_fleet is null then raise exception 'CHECK setup: no free fleet car to test with'; end if;
  insert into public.loaner_handovers (fleet_id, loaner_plate, given_at) values (v_fleet, 'TEST-42', now());
  begin
    insert into public.loaner_handovers (fleet_id, loaner_plate, given_at) values (v_fleet, 'TEST-42', now());
    raise exception 'CHECK FAILED: the same fleet car was handed over twice';
  exception when unique_violation then null;
  end;
  -- A return can't be before the handover.
  begin
    insert into public.loaner_handovers (loaner_plate, given_at, returned_at) values ('TEST-42', now(), now() - interval '1 day');
    raise exception 'CHECK FAILED: a return before the handover was accepted';
  exception when check_violation then null;
  end;

  ---------------------------------------------------------------- tickets (bugs / features)
  -- Closing a ticket requires "מה בוצע".
  select id into v_req from public.app_requests limit 1;
  if v_req is not null then
    begin
      perform public.dev_reply_request(v_req, '', 'DONE', null, false);
      raise exception 'CHECK FAILED: a ticket was closed without "מה בוצע"';
    exception when raise_exception then
      if sqlerrm like 'CHECK FAILED%' then raise; end if;
    end;
  end if;

  ---------------------------------------------------------------- triggers that must exist
  select count(*) into n from pg_trigger where not tgisinternal and tgenabled <> 'D' and tgname in ('cases_painter_status_at', 'app_requests_log_events');
  if n < 2 then
    select count(*) into n from pg_trigger t join pg_proc p on p.oid = t.tgfoid where not t.tgisinternal and t.tgenabled <> 'D' and p.proname in ('cases_touch_painter_status_at', 'app_requests_log_events');
    if n < 2 then raise exception 'CHECK FAILED: a required trigger is missing or disabled (painter_status_at / ticket history)'; end if;
  end if;

  ---------------------------------------------------------------- security
  -- Every table in the exposed schema has RLS on.
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n > 0 then raise exception 'CHECK FAILED: % public table(s) without RLS', n; end if;

  -- No SECURITY DEFINER function is callable without signing in.
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute');
  if n > 0 then raise exception 'CHECK FAILED: % SECURITY DEFINER function(s) callable by anon', n; end if;

  -- The sensitive functions are closed to signed-in users too.
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname in ('get_app_secret', 'set_app_secret', 'dev_reply_request', 'claim_notification_email', 'check_push_dispatch_secret')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if n > 0 then raise exception 'CHECK FAILED: % sensitive function(s) callable by users', n; end if;

  -- No policy opens a table to everyone with a bare "true" (RLS is what keeps
  -- the server-only tables closed: the table GRANT to anon is Supabase's default).
  select count(*) into n from pg_policies
   where schemaname in ('public', 'storage') and (roles::text like '%anon%' or roles::text like '%public%')
     and (trim(coalesce(qual, '')) = 'true' or trim(coalesce(with_check, '')) = 'true');
  if n > 0 then raise exception 'CHECK FAILED: % policy(ies) open to everyone with "true"', n; end if;

  -- All storage buckets are private.
  select count(*) into n from storage.buckets where public;
  if n > 0 then raise exception 'CHECK FAILED: % public storage bucket(s)', n; end if;
end
$$;

-- Case history (audit_events): a signed-in user writes only under their own
-- name (security review 16/10) — checked by impersonating a real active user.
do $$
declare
  v_me uuid;
  v_other uuid;
  v_case uuid;
begin
  select id into v_me from public.profiles where is_active and role <> 'CEO' limit 1;
  select id into v_other from public.profiles where is_active and id <> v_me limit 1;
  select id into v_case from public.cases limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_me, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.audit_events (entity_type, entity_id, action, user_id) values ('CASE', v_case, 'TEST_42', v_me);
  begin
    insert into public.audit_events (entity_type, entity_id, action, user_id) values ('CASE', v_case, 'TEST_42', null);
    raise exception 'CHECK FAILED: a history event without a user was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.audit_events (entity_type, entity_id, action, user_id) values ('CASE', v_case, 'TEST_42', v_other);
    raise exception 'CHECK FAILED: a history event under someone else''s name was accepted';
  exception when insufficient_privilege then null;
  end;
  reset role;
end
$$;

rollback;

select 'db checks passed' as result;
