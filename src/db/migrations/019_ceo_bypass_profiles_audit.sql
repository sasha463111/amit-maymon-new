-- 019: Restore CEO bypass for profiles + audit_events that 018 dropped by mistake.

-- CEO can see all profiles (needed for case detail user-name resolution, settings)
DROP POLICY IF EXISTS profiles_select_ceo ON profiles;
CREATE POLICY profiles_select_ceo ON profiles
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'CEO');

-- CEO can see all audit events
DROP POLICY IF EXISTS audit_events_select_ceo ON audit_events;
CREATE POLICY audit_events_select_ceo ON audit_events
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'CEO');
