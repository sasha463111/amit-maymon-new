-- Claims screen (Amit, 2026-10-14): the car type in the claim header, and each
-- collector's own one-tap stage shortcuts (editable).
alter table public.collection_cases add column if not exists vehicle_type text;

create table if not exists public.collection_user_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stage_shortcuts text[],
  updated_at timestamptz not null default now()
);
-- Server-only (service role after the role check), like the other collections tables.
alter table public.collection_user_prefs enable row level security;

-- Car type for claims already linked to a repair case.
update public.collection_cases cc
   set vehicle_type = c.vehicle_type
  from public.cases k join public.cars c on c.id = k.car_id
 where k.id = cc.case_id and cc.vehicle_type is null and c.vehicle_type is not null;
