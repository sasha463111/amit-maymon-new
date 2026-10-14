-- Customer ID / email + VAT-file check on the repair case (Amit, 2026-10-14).
-- A customer with a VAT file (עוסק / חברה) offsets VAT on the car, so the
-- insurer pays without the VAT share and the garage must collect it from him
-- — with a CPA letter stating the share (1/3, 2/3, full). Checking while the
-- car is in the garage avoids chasing it a month later.
alter table public.cases
  add column if not exists customer_id_number text,
  add column if not exists customer_email text,
  add column if not exists vat_status text check (vat_status in ('NONE', 'DEALER', 'COMPANY')),
  add column if not exists vat_share text check (vat_share in ('THIRD', 'TWO_THIRDS', 'FULL')),
  add column if not exists vat_checked_at timestamptz,
  add column if not exists vat_checked_by uuid references public.profiles(id),
  add column if not exists vat_cpa_requested_at timestamptz,
  add column if not exists vat_cpa_received_at timestamptz;
create index if not exists cases_customer_id_number on public.cases (customer_id_number) where customer_id_number is not null;
