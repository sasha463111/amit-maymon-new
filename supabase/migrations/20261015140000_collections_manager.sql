-- Claims department manager (Amit, 2026-10-15, Discussion #2): each collector
-- sees only her own claims; Amit, Chani — and Galit, who manages the claims
-- department — see all of them, and Galit also gets the weekly summary.
-- A flag (not a new role): Galit stays a collector with her own claims.
-- profiles has no user UPDATE grant, so only the server can set it.
alter table public.profiles add column if not exists collections_manager boolean not null default false;
update public.profiles set collections_manager = true where id = '08ccf216-167c-4e20-a7e1-52c7d975e84e' and role = 'COLLECTIONS';
