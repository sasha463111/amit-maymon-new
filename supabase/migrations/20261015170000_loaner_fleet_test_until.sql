-- Loaner fleet: test (רישיון רכב) validity from the Ministry of Transport
-- registry + one reminder a month before it expires (Tomer, 15/10).
-- Applied via MCP apply_migration (name: loaner_fleet_test_until).
alter table public.loaner_fleet add column if not exists test_until date;
-- The test_until value the last reminder was sent for (one reminder per expiry).
alter table public.loaner_fleet add column if not exists test_reminded_for date;
