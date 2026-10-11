-- Scheduled reminders run from Supabase every 30 minutes (2026-10-11).
--
-- Why: the reminders route (/api/cron/enter-work-reminders) was triggered by
-- a GitHub Actions schedule "every 30 min", but GitHub ran it only 3–4 times
-- a day (11/10: 09:09, 16:16, 21:17 Israel time). Reminders, the 1-hour backup
-- emails and the 18:00 daily report all arrived hours late.
--
-- pg_cron calls the route with pg_net, authenticated by the same Vault secret
-- the push dispatcher already uses (push_dispatch_secret) — no new secret.
-- The GitHub workflow stays as a fallback; every round is idempotent.
-- Idempotent: safe to run again.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Re-create the job so a re-run picks up changes.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'tehila-reminders';

SELECT cron.schedule(
  'tehila-reminders',
  '*/30 * * * *',
  $job$
  SELECT net.http_get(
    url := 'https://amit-maymon-new-psi.vercel.app/api/cron/enter-work-reminders',
    headers := jsonb_build_object(
      'x-dispatch-secret',
      coalesce((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_dispatch_secret' LIMIT 1), '')
    ),
    timeout_milliseconds := 60000
  );
  $job$
);
