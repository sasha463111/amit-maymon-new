-- Import of the returns history from Amit's Excel (2026-10-14): 153 returns
-- (Netivot NET-…, Ashkelon ASH-…). Keep the Excel tracking number, the names
-- as typed (they don't map 1:1 to users), and allow rows without a sticker
-- photo (the Excel has none).
alter table public.part_returns
  add column if not exists external_ref text,
  add column if not exists source text,
  add column if not exists opened_by_name text,
  add column if not exists handed_by_name text,
  add column if not exists delivery_note_number text,
  add column if not exists placed_at timestamptz;
create unique index if not exists part_returns_external_ref on public.part_returns (external_ref) where external_ref is not null;
alter table public.part_returns alter column sticker_path drop not null;
