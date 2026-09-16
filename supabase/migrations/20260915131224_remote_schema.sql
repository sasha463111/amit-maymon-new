SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.fanout_notifications_to_ceos()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, case_id, type, title, body, action_url, triggered_by, read)
  SELECT p.id, NEW.case_id, NEW.type, NEW.title, NEW.body, NEW.action_url, NEW.triggered_by, false
  FROM profiles p
  WHERE p.is_active = true
    AND (p.role = 'CEO' OR (p.role = 'SERVICE_ADVISOR' AND p.sees_all_branches = true))
    AND p.id <> NEW.user_id
    AND (p.role = 'CEO' OR NEW.triggered_by IS NULL OR p.id <> NEW.triggered_by)
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = p.id
        AND n.case_id IS NOT DISTINCT FROM NEW.case_id
        AND n.type = NEW.type AND n.title = NEW.title
        AND n.triggered_by IS NOT DISTINCT FROM NEW.triggered_by
        AND n.created_at > now() - interval '10 seconds'
    );
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.get_my_branch_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT branch_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_branch_ids()
  RETURNS uuid[]
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
  RETURN COALESCE(
    (SELECT branch_ids FROM profiles WHERE id = auth.uid()),
    '{}'::uuid[]
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
  AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'SERVICE_ADVISOR' -- default role; admin must update to correct role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

