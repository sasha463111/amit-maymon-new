-- "🤖 התייעצות" (Amit, 2026-10-15): Amit consults Claude directly inside the
-- app. The conversation is kept per user (server-only). Change requests the
-- chat files go to app_requests and wait for Tomer's approval (option ב׳).
create table if not exists public.advisor_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists advisor_messages_user on public.advisor_messages (user_id, created_at);
alter table public.advisor_messages enable row level security;
