-- Design round C (16/10): "מעקב רכב" — a personal link for the customer that
-- shows where the car is in the repair (/t/[token]). Only the SHA-256 of the
-- token is stored; a new link replaces the previous one.
alter table public.cases add column if not exists track_token_hash text;
alter table public.cases add column if not exists track_expires_at timestamptz;
create unique index if not exists cases_track_token_hash_key on public.cases (track_token_hash) where track_token_hash is not null;
