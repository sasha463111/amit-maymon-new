-- #43 (15/10): in-house error monitoring. Every error a user hits in the app
-- (error boundaries + unhandled browser errors) is logged here, one row per
-- distinct error (fingerprint) with a counter. The first time an error is
-- seen, a BUG ticket opens automatically on /bugs (request_id). Server-only:
-- written by the reportClientError action with the service client.

create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  source text not null check (source in ('boundary', 'window', 'promise')),
  message text not null,
  digest text,
  path text,
  stack text,
  user_agent text,
  first_user uuid references public.profiles(id) on delete set null,
  last_user uuid references public.profiles(id) on delete set null,
  users uuid[] not null default '{}',
  count integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  request_id uuid references public.app_requests(id) on delete set null
);

create index if not exists app_errors_last_seen_idx on public.app_errors (last_seen desc);

alter table public.app_errors enable row level security;
revoke all on public.app_errors from anon, authenticated;
