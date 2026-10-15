-- Staff mobile numbers (Amit, 2026-10-15): kept for the CEO in "משתמשים"
-- (call / WhatsApp, and sending a reset password straight to the person).
-- A separate server-only table, not a profiles column: profiles is readable by
-- every signed-in user, phone numbers shouldn't be.
create table if not exists public.staff_phones (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone text not null,
  updated_at timestamptz not null default now()
);
alter table public.staff_phones enable row level security;
