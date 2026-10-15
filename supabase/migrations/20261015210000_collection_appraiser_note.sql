-- "שמאי וסכומים" notes (Sapir 15/10: "שורה מתחת לסכום שאושר — אופציה להערות").
-- Applied via MCP apply_migration (name: collection_appraiser_note).
alter table public.collection_cases add column if not exists appraiser_note text;
