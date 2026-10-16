-- 📧 Outlook in the app (Amit/Tomer 16/10 — like BAFI's B-mail): every
-- employee connects their own Microsoft 365 mailbox (delegated OAuth, read
-- only), reads it inside the app, and attaches an email to a case / claim.
-- Both tables are server-only (RLS on, no policies; the service client after
-- an access check). Refresh tokens are stored ENCRYPTED (AES-256-GCM, key in
-- the env, not in the DB).

create table if not exists public.ms_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  ms_email text not null,
  ms_name text,
  refresh_token_enc text not null,
  scopes text,
  connected_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.ms_connections enable row level security;
revoke all on public.ms_connections from anon, authenticated;

-- An email saved to a case: a copy (subject, sender, body, attachments in the
-- private bucket) so it stays with the case even if deleted from the mailbox.
create table if not exists public.case_emails (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('CASE', 'COLLECTION', 'REFERRAL')),
  target_id uuid not null,
  internet_message_id text,
  subject text,
  from_name text,
  from_email text,
  to_list text,
  received_at timestamptz,
  body_html text,
  body_preview text,
  attachments jsonb not null default '[]',
  attached_by uuid references public.profiles(id) on delete set null,
  attached_at timestamptz not null default now()
);
create index if not exists case_emails_target_idx on public.case_emails (target_type, target_id, received_at desc);
create unique index if not exists case_emails_once on public.case_emails (target_type, target_id, internet_message_id) where internet_message_id is not null;
alter table public.case_emails enable row level security;
revoke all on public.case_emails from anon, authenticated;

insert into storage.buckets (id, name, public) values ('case-emails', 'case-emails', false) on conflict (id) do nothing;
