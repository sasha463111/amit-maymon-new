-- 022: Branch-scoped RLS on storage buckets.
-- Previously: storage.objects policies were "bucket_id = '...'" only — any
-- authenticated user could read any object. The UUID-as-folder-name was the
-- only thing keeping cross-branch leakage from happening.
-- Now: every read/insert/delete on the three private buckets requires the
-- caller to have access to the case (matching branch_id or CEO role).
--
-- Path convention for all three buckets: <case_uuid>/...
-- This is enforced in the upload code in src/app/actions/documents.ts,
-- src/app/(dashboard)/extras/new/CreateExtraForm.tsx, and src/app/actions/painter.ts.

-- Helpers live in public because storage schema is owned by Supabase platform.
CREATE OR REPLACE FUNCTION public._storage_case_id(name text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(split_part(name, '/', 1), '')::uuid
$$;

CREATE OR REPLACE FUNCTION public._storage_user_can_see_case(case_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cases c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = case_id
      AND (p.role = 'CEO' OR p.branch_id = c.branch_id)
  )
$$;

GRANT EXECUTE ON FUNCTION public._storage_case_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._storage_user_can_see_case(uuid) TO authenticated;

-- Replace the wide-open policies.
DROP POLICY IF EXISTS "case-documents read"   ON storage.objects;
DROP POLICY IF EXISTS "case-documents upload" ON storage.objects;
DROP POLICY IF EXISTS "case-documents delete" ON storage.objects;
DROP POLICY IF EXISTS "painter-images read"   ON storage.objects;
DROP POLICY IF EXISTS "painter-images upload" ON storage.objects;
DROP POLICY IF EXISTS "extras-images read"    ON storage.objects;
DROP POLICY IF EXISTS "extras-images upload"  ON storage.objects;

CREATE POLICY "case-documents read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'case-documents' AND public._storage_user_can_see_case(public._storage_case_id(name)));

CREATE POLICY "case-documents upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'case-documents' AND public._storage_user_can_see_case(public._storage_case_id(name)));

CREATE POLICY "case-documents delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'case-documents' AND public._storage_user_can_see_case(public._storage_case_id(name)));

CREATE POLICY "painter-images read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'painter-images' AND public._storage_user_can_see_case(public._storage_case_id(name)));

CREATE POLICY "painter-images upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'painter-images' AND public._storage_user_can_see_case(public._storage_case_id(name)));

CREATE POLICY "extras-images read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'extras-images' AND public._storage_user_can_see_case(public._storage_case_id(name)));

CREATE POLICY "extras-images upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'extras-images' AND public._storage_user_can_see_case(public._storage_case_id(name)));
