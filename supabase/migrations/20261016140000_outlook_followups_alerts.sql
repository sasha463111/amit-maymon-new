-- 📧 Outlook round 2 (16/10, Tomer "תבנה את 1-6"):
--  • "⏰ תזכיר לי אם לא ענו": a follow-up on a sent email, cancelled by itself
--    when a reply arrives in the same conversation (a claim → its reminder
--    in the claim log; a repair case / referral → a note to the sender).
--  • a mail check every cron run: new email about an open case → a note;
--    the unread count for the "📧 דואר" badge.

alter table public.ms_connections add column if not exists last_mail_check_at timestamptz;
alter table public.ms_connections add column if not exists unread_count integer not null default 0;

alter table public.case_emails add column if not exists conversation_id text;
alter table public.case_emails add column if not exists direction text not null default 'IN' check (direction in ('IN', 'OUT'));
alter table public.case_emails add column if not exists follow_up_at timestamptz;
alter table public.case_emails add column if not exists follow_up_user uuid references public.profiles(id) on delete set null;
alter table public.case_emails add column if not exists follow_up_event uuid references public.collection_case_events(id) on delete set null;
alter table public.case_emails add column if not exists follow_up_done_at timestamptz;
alter table public.case_emails add column if not exists follow_up_sent_at timestamptz;
create index if not exists case_emails_followup_idx on public.case_emails (follow_up_user, conversation_id) where follow_up_at is not null and follow_up_done_at is null;
