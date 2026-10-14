-- Driver's declaration (Amit, 2026-10-14): the details needed to transfer
-- traffic fines (full name, ID number, licence number, address, phone), as
-- declared and signed by the customer at hand-over. Server-only table.
-- TODO (security phase 3): encrypt this column at the application level.
ALTER TABLE public.loaner_handovers ADD COLUMN IF NOT EXISTS driver_details jsonb;
