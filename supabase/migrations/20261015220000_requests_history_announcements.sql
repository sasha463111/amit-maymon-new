-- "ג'ירה הקטנה" (Tomer, 15/10) on the /bugs and /features boards:
--  1. History — app_request_events, filled by a trigger on every change of
--     status / priority / kind (and on creation). A timeline on every card.
--  2. Closing notes — "מה בוצע" (+ optional commit) travel with the update
--     (pending_note / pending_commit, consumed by the trigger) into the event.
--  3. Announcements — "🆕 מה חדש" banner for everyone (app_announcements),
--     each user can dismiss it for themselves.
-- The actor of a change: app_requests.updated_by, set by the server actions
-- (null = the development team from the terminal, dev_reply_request).

alter table public.app_requests add column if not exists updated_by uuid references public.profiles(id);
alter table public.app_requests add column if not exists pending_note text;
alter table public.app_requests add column if not exists pending_commit text;

create table if not exists public.app_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.app_requests(id) on delete cascade,
  field text not null check (field in ('CREATED', 'STATUS', 'PRIORITY', 'KIND')),
  from_value text,
  to_value text,
  note text,
  commit_ref text,
  by_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists app_request_events_req on public.app_request_events (request_id, created_at);
alter table public.app_request_events enable row level security;

create or replace function public.app_requests_log_events()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.app_request_events (request_id, field, to_value, by_id, created_at)
    values (new.id, 'CREATED', new.status, new.created_by, new.created_at);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.app_request_events (request_id, field, from_value, to_value, note, commit_ref, by_id)
    values (new.id, 'STATUS', old.status, new.status, nullif(trim(new.pending_note), ''), nullif(trim(new.pending_commit), ''), new.updated_by);
  end if;
  if new.priority is distinct from old.priority then
    insert into public.app_request_events (request_id, field, from_value, to_value, by_id)
    values (new.id, 'PRIORITY', old.priority::text, new.priority::text, new.updated_by);
  end if;
  if new.kind is distinct from old.kind then
    insert into public.app_request_events (request_id, field, from_value, to_value, by_id)
    values (new.id, 'KIND', old.kind, new.kind, new.updated_by);
  end if;
  return new;
end $$;
revoke all on function public.app_requests_log_events() from public, anon, authenticated;

-- The note / commit belong to this one change only — cleared before the row is written.
create or replace function public.app_requests_clear_pending()
returns trigger language plpgsql set search_path = public as $$
begin
  new.pending_note := null;
  new.pending_commit := null;
  return new;
end $$;

drop trigger if exists app_requests_events_ins on public.app_requests;
create trigger app_requests_events_ins after insert on public.app_requests
  for each row execute function public.app_requests_log_events();
drop trigger if exists app_requests_events_upd on public.app_requests;
-- BEFORE so the event reads pending_* and the row is stored without them.
create trigger app_requests_events_upd before update on public.app_requests
  for each row execute function public.app_requests_log_events();
drop trigger if exists app_requests_zz_clear_pending on public.app_requests;
create trigger app_requests_zz_clear_pending before update on public.app_requests
  for each row execute function public.app_requests_clear_pending();

-- Backfill: every request gets its "נפתח" event; finished ones a status event.
insert into public.app_request_events (request_id, field, to_value, by_id, created_at)
select r.id, 'CREATED', 'NEW', r.created_by, r.created_at from public.app_requests r
where not exists (select 1 from public.app_request_events e where e.request_id = r.id and e.field = 'CREATED');
insert into public.app_request_events (request_id, field, from_value, to_value, created_at)
select r.id, 'STATUS', 'NEW', r.status, r.updated_at from public.app_requests r
where r.status <> 'NEW' and not exists (select 1 from public.app_request_events e where e.request_id = r.id and e.field = 'STATUS');

-- Announcements — "🆕 מה חדש".
create table if not exists public.app_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  request_id uuid references public.app_requests(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  active boolean not null default true
);
create table if not exists public.app_announcement_dismissals (
  announcement_id uuid not null references public.app_announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table public.app_announcements enable row level security;
alter table public.app_announcement_dismissals enable row level security;
drop policy if exists app_announcements_read on public.app_announcements;
create policy app_announcements_read on public.app_announcements for select to authenticated using (active);
drop policy if exists app_announcement_dismissals_own_read on public.app_announcement_dismissals;
create policy app_announcement_dismissals_own_read on public.app_announcement_dismissals for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists app_announcement_dismissals_own_insert on public.app_announcement_dismissals;
create policy app_announcement_dismissals_own_insert on public.app_announcement_dismissals for insert to authenticated with check ((select auth.uid()) = user_id);
grant select on public.app_announcements to authenticated;
grant select, insert on public.app_announcement_dismissals to authenticated;

-- The terminal reply (skill app-requests): + commit, + "notify the requester"
-- (default yes). A status change goes through the trigger like any other.
drop function if exists public.dev_reply_request(uuid, text, text);
create or replace function public.dev_reply_request(p_request uuid, p_body text, p_status text default null, p_commit text default null, p_notify boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare r public.app_requests;
begin
  select * into r from public.app_requests where id = p_request;
  if not found then raise exception 'request not found'; end if;
  if p_status is not null and p_status not in ('NEW', 'IN_PROGRESS', 'DONE', 'NO') then raise exception 'bad status'; end if;
  if p_status = 'DONE' and coalesce(trim(p_body), '') = '' then raise exception 'closing needs "מה בוצע"'; end if;
  insert into public.app_request_messages (request_id, body, author_id) values (p_request, p_body, null);
  update public.app_requests
     set status = coalesce(p_status, status), updated_at = now(), updated_by = null,
         pending_note = case when p_status is not null then p_body end, pending_commit = p_commit
   where id = p_request;
  if p_notify then
    insert into public.notifications (user_id, type, title, body, action_url)
    values (r.created_by, 'DIRECT_NOTE',
            case coalesce(p_status, '') when 'DONE' then '✅ הבקשה שלך בוצעה' when 'IN_PROGRESS' then '🔧 התחלנו לעבוד על הבקשה שלך' when 'NO' then '⏸ הבקשה שלך נדחתה לבינתיים' else '💡 תשובה על הבקשה שלך' end,
            left(p_body, 300), '/requests#' || p_request);
  end if;
end $$;
revoke all on function public.dev_reply_request(uuid, text, text, text, boolean) from public, anon, authenticated;
