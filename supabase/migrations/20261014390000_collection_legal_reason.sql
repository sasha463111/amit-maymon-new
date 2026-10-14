-- Legal handling as its own screen (Amit, 2026-10-14): why the claim went
-- to legal — differences, rejection, depreciation… ("אחר: …" free text).
alter table public.collection_cases add column if not exists legal_reason text;
