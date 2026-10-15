-- "💡 הצעות ייעול" (Amit, 2026-10-15): Amit writes improvement requests in the
-- app (instead of GitHub Discussions, which went private); the developer
-- side answers in the same thread and he gets a push. CEO only, server-only
-- tables (service client after the role check), private bucket for screenshots.
create table if not exists public.app_requests (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  status text not null default 'NEW' check (status in ('NEW', 'IN_PROGRESS', 'DONE', 'NO')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.app_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.app_requests(id) on delete cascade,
  body text not null default '',
  image_path text,
  -- null = the development team (answered by Claude / Tomer from the terminal)
  author_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists app_request_messages_req on public.app_request_messages (request_id, created_at);
alter table public.app_requests enable row level security;
alter table public.app_request_messages enable row level security;

insert into storage.buckets (id, name, public) values ('app-requests', 'app-requests', false) on conflict (id) do nothing;

-- The development side answers (run from the terminal with the service role):
-- adds the reply, optionally moves the status, and pushes to the requester.
create or replace function public.dev_reply_request(p_request uuid, p_body text, p_status text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.app_requests;
begin
  select * into r from public.app_requests where id = p_request;
  if not found then raise exception 'request not found'; end if;
  if p_status is not null and p_status not in ('NEW', 'IN_PROGRESS', 'DONE', 'NO') then raise exception 'bad status'; end if;
  insert into public.app_request_messages (request_id, body, author_id) values (p_request, p_body, null);
  update public.app_requests set status = coalesce(p_status, status), updated_at = now() where id = p_request;
  insert into public.notifications (user_id, type, title, body, action_url)
  values (r.created_by, 'DIRECT_NOTE',
          case coalesce(p_status, '') when 'DONE' then '✅ הבקשה שלך בוצעה' when 'IN_PROGRESS' then '🔧 התחלנו לעבוד על הבקשה שלך' else '💡 תשובה על הבקשה שלך' end,
          left(p_body, 300), '/requests#' || p_request);
end $$;
revoke all on function public.dev_reply_request(uuid, text, text) from public, anon, authenticated;
