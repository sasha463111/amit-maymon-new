-- First-visit tips (16/10, UI round #10 / #39): which tips each person has
-- already seen ("הבנתי" / "דלג"), so a tip never comes back — on any device.
create table if not exists public.user_tips_seen (
  user_id uuid not null references public.profiles(id) on delete cascade,
  tip_key text not null check (char_length(tip_key) between 1 and 80),
  seen_at timestamptz not null default now(),
  primary key (user_id, tip_key)
);

alter table public.user_tips_seen enable row level security;

-- Own rows only.
create policy user_tips_seen_select_own on public.user_tips_seen
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_tips_seen_insert_own on public.user_tips_seen
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_tips_seen_delete_own on public.user_tips_seen
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.user_tips_seen from anon;
grant select, insert, delete on public.user_tips_seen to authenticated;
