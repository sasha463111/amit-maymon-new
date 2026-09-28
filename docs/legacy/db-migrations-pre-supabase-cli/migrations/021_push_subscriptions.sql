-- 021: Web Push subscriptions
-- Stores Push API subscriptions per user so the server can dispatch web push
-- notifications via web-push (VAPID). Bucket of (endpoint, p256dh, auth)
-- uniquely identifies a browser/device subscription.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select ON push_subscriptions;
CREATE POLICY push_subscriptions_select ON push_subscriptions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
  );

DROP POLICY IF EXISTS push_subscriptions_insert ON push_subscriptions;
CREATE POLICY push_subscriptions_insert ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_update ON push_subscriptions;
CREATE POLICY push_subscriptions_update ON push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_delete ON push_subscriptions;
CREATE POLICY push_subscriptions_delete ON push_subscriptions
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
  );
