-- Login code by SMS (Amit/Tomer, 2026-10-15): staff work from their phones, so
-- instead of an authenticator app (Duo) the second step is a code by SMS.
-- profiles.sms_required: the CEO turns it on per person / for everyone with a
-- mobile number (staff_phones). login_codes: one row per sent code (hash
-- only, 5-minute expiry, attempt count), verified per Supabase session.
-- trusted_devices: "remember this phone for 30 days" (cookie token, hash only).
-- All server-only (RLS on, no policies). profiles has no user UPDATE grant,
-- so nobody can switch sms_required off for themselves.
alter table public.profiles add column if not exists sms_required boolean not null default false;

create table if not exists public.login_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists login_codes_user on public.login_codes (user_id, created_at desc);
alter table public.login_codes enable row level security;

create table if not exists public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  label text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists trusted_devices_user on public.trusted_devices (user_id);
alter table public.trusted_devices enable row level security;
