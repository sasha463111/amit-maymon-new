-- Claim kit, stage 2 (Amit, 2026-10-15, Discussion #4): the customer link
-- also carries kit documents to fill and sign remotely. The link stores which
-- documents and our prefilled values; each signed document is one row
-- (values as signed + the signature image path + when / IP / device).
-- Server-only (service role after the token check), like the link itself.
alter table public.customer_doc_links
  add column if not exists kit_docs text[],
  add column if not exists kit_values jsonb,
  add column if not exists kit_signed_at timestamptz;

create table if not exists public.kit_signatures (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.customer_doc_links(id) on delete cascade,
  referral_id uuid not null references public.referrals(id) on delete cascade,
  doc_id text not null,
  doc_title text not null,
  kit_version text not null,
  values jsonb not null default '{}'::jsonb,
  signature_path text not null,
  signed_at timestamptz not null default now(),
  ip text,
  ua text,
  unique (link_id, doc_id)
);
create index if not exists kit_signatures_referral on public.kit_signatures (referral_id, signed_at desc);
alter table public.kit_signatures enable row level security;
