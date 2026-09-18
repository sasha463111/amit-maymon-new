-- Let the settings tables follow the permission matrix too
--
-- The server actions now gate Settings on has_permission('manage_settings'),
-- but RLS on the settings tables was still hard-coded to role = 'CEO'. Without
-- this, delegating manage_settings would half-work: the action would allow the
-- request and the database would silently reject it.
--
-- role_permissions previously had a single ALL policy for CEO, which also meant
-- non-CEO users could not even READ the matrix — so a delegated user would open
-- Settings to an empty table. Read is now open to any authenticated user (it is
-- policy, not sensitive data, and the app needs it to render), while writes
-- follow manage_settings.
--
-- No recursion risk: has_permission() is SECURITY DEFINER, so its own read of
-- role_permissions bypasses these policies.
--
-- The CEO can never be locked out: has_permission() short-circuits to true for
-- CEO before consulting the table, and updateRolePermission() refuses to edit
-- CEO rows.

-- ---------------------------------------------------------------------------
-- role_permissions
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "CEO can manage role_permissions" ON "public"."role_permissions";

CREATE POLICY "role_permissions_select" ON "public"."role_permissions"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "role_permissions_write" ON "public"."role_permissions"
  FOR UPDATE
  TO "authenticated"
  USING (public.has_permission('manage_settings'))
  WITH CHECK (
    public.has_permission('manage_settings')
    -- CEO rows are immutable: the CEO must always retain every permission so
    -- that no configuration can lock the owner out of their own system.
    AND role <> 'CEO'
  );

-- ---------------------------------------------------------------------------
-- workflow_step_templates
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "CEO can manage workflow_step_templates" ON "public"."workflow_step_templates";

CREATE POLICY "workflow_step_templates_write" ON "public"."workflow_step_templates"
  FOR ALL
  TO "authenticated"
  USING (public.has_permission('manage_settings'))
  WITH CHECK (public.has_permission('manage_settings'));
