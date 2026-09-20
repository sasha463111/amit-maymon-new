-- Pre-launch hardening: close public read on system_messages, index foreign keys
--
-- 1) system_messages was readable by `anon` — the read_system_messages policy
--    targeted PUBLIC rather than authenticated, so the in-app banner text was
--    served to anyone hitting /rest/v1/system_messages with the browser key.
--    Low severity (one active operational message), but it is internal content
--    and there is no reason to publish it before launch.
--
-- 2) Eight foreign keys had no covering index. At today's size (63 cases,
--    34 referrals) this is invisible, but every one of them sits on a join the
--    app performs on page load — actor names on the case page, uploader on
--    documents, follow-ups on referrals. They get slower linearly as data
--    grows, which is exactly what launch and marketing would cause.
--    CREATE INDEX IF NOT EXISTS is safe and idempotent.

-- ---------------------------------------------------------------------------
-- 1. system_messages: authenticated only
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "read_system_messages" ON "public"."system_messages";

CREATE POLICY "read_system_messages" ON "public"."system_messages"
  FOR SELECT
  TO "authenticated"
  USING (true);

-- ---------------------------------------------------------------------------
-- 2. Covering indexes for unindexed foreign keys
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_activity_log_user_id
  ON public.activity_log (user_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id
  ON public.audit_log (user_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by
  ON public.audit_log (changed_by);

CREATE INDEX IF NOT EXISTS idx_referral_documents_uploaded_by
  ON public.referral_documents (uploaded_by);

CREATE INDEX IF NOT EXISTS idx_referral_status_updates_created_by
  ON public.referral_status_updates (created_by);

CREATE INDEX IF NOT EXISTS idx_referrals_case_id
  ON public.referrals (case_id);

CREATE INDEX IF NOT EXISTS idx_referrals_created_by
  ON public.referrals (created_by);

CREATE INDEX IF NOT EXISTS idx_system_messages_created_by
  ON public.system_messages (created_by);
