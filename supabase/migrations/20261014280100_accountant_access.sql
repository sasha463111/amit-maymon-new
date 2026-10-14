-- Bookkeeper access (Amit, 2026-10-14): returns (full tracking, credits,
-- invoices archive), finance dashboard (read), collections + collections
-- dashboard (granted in finance_viewers). Every action OFF in the matrix.
INSERT INTO public.role_permissions (role, action, enabled)
SELECT 'ACCOUNTANT'::public.user_role, a.action, false
FROM (SELECT DISTINCT action FROM public.role_permissions) AS a
ON CONFLICT (role, action) DO NOTHING;

-- Returns tracking + supplier documents (both use this function).
CREATE OR REPLACE FUNCTION public.can_track_part_returns()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_active
      AND role::text IN ('CEO', 'SERVICE_ADVISOR', 'SERVICE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_MANAGER', 'ACCOUNTANT')
  );
$function$;

-- Finance dashboard: read-only for the bookkeeper (the CEO policy stays as is).
CREATE OR REPLACE FUNCTION public.is_active_accountant()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role::text = 'ACCOUNTANT');
$$;
REVOKE EXECUTE ON FUNCTION public.is_active_accountant() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_active_accountant() TO authenticated;

CREATE POLICY finance_closures_accountant_read ON public.finance_closures FOR SELECT TO authenticated
USING (public.is_active_accountant());
