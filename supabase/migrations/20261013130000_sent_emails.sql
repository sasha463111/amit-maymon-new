-- Once-only email keys (2026-10-13). Moving mail from Resend to Microsoft 365
-- (Graph sendMail) loses Resend's Idempotency-Key, which kept the half-hourly
-- cron from sending the daily report twice. src/lib/mailer.ts claims the key
-- here before sending (insert … on conflict do nothing) and releases it if the
-- send fails. Server-only: RLS on, no policies → only the service role.
CREATE TABLE IF NOT EXISTS public.sent_emails (
  key text PRIMARY KEY,
  sent_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sent_emails ENABLE ROW LEVEL SECURITY;
