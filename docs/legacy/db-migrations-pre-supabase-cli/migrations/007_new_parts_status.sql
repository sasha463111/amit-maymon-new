-- Migration 007: Add AIRMAIL_PENDING to parts_status enum
-- Note: ALTER TYPE ADD VALUE cannot run inside a transaction block.
-- Run this migration separately, not inside BEGIN/COMMIT.

ALTER TYPE parts_status ADD VALUE IF NOT EXISTS 'AIRMAIL_PENDING';
