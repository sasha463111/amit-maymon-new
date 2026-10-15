-- Returns › invoices / delivery notes (Amit 15/10, tickets #30 + #31): the
-- items on the document ("תיאור פריט"), read from the photo or typed; shown as
-- a column in the archive table. Required when saving (with the other fields).
alter table public.supplier_documents add column if not exists items text;
