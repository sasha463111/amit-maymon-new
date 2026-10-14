-- Bookkeeper ("מנהלת חשבונות", חני — Amit 2026-10-14). Enum value in its own migration.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'ACCOUNTANT';
