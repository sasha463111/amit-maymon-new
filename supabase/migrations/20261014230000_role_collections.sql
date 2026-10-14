-- Claims collectors ("מסלקת תביעות": ספיר מימון, גלית וענונו, ליטל ביטון —
-- Amit, 2026-10-14). Enum values must be committed before use: own migration.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'COLLECTIONS';
