-- Applied via MCP apply_migration (names: driver_role, loaners_access), 15/10.
-- "נהג" (Tomer): drivers who move loaner cars — they see ONLY the loaner-car module.
alter type public.user_role add value if not exists 'DRIVER';
-- Loaner-car module for specific people beyond the office / CEO: the painters
-- בתאל, דקל, כפיר, ניסים. Changed only through the service client.
alter table public.profiles add column if not exists loaners_access boolean not null default false;
