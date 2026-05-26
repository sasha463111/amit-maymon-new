-- 022: allow users to refresh an existing Push API subscription.
-- `upsert(... onConflict endpoint)` needs UPDATE permission when the browser
-- reuses the same endpoint. Without this, "enable push" can fail after the
-- first attempt and leave the app looking stuck.

DROP POLICY IF EXISTS push_subscriptions_update ON push_subscriptions;
CREATE POLICY push_subscriptions_update ON push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
