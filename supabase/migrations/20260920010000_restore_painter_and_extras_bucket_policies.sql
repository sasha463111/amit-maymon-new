-- Restore the painter-images and extras-images bucket policies
--
-- The 20260915115332 remote-schema migration dropped every storage.objects
-- policy. On 2026-09-18 the referral-documents and case-documents policies were
-- restored — but painter-images and extras-images were missed, and with RLS
-- enabled and zero policies Postgres denies everything.
--
-- Impact: nobody could upload or view painter work photos or bodywork-extra
-- photos. Verified by impersonation before this fix — PAINTER and
-- SERVICE_MANAGER were both BLOCKED on both buckets.
--
-- These are restored exactly as originally defined in 20260901180001: gated on
-- case/branch access only, with NO upload_documents check. That is deliberate,
-- not an oversight:
--
--   case-documents  = formal case paperwork  -> requires upload_documents
--   painter-images  = photos of the work     -> anyone working that branch's case
--   extras-images   = photos of an extra     -> anyone working that branch's case
--
-- A painter has upload_documents = false yet must obviously still be able to
-- photograph the car he is working on. Gating these buckets on that permission
-- would break the painter's core workflow.

CREATE POLICY "painter-images read" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (
    bucket_id = 'painter-images'::text
    AND public._storage_user_can_see_case(public._storage_case_id(name))
  );

CREATE POLICY "painter-images upload" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    bucket_id = 'painter-images'::text
    AND public._storage_user_can_see_case(public._storage_case_id(name))
  );

CREATE POLICY "extras-images read" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (
    bucket_id = 'extras-images'::text
    AND public._storage_user_can_see_case(public._storage_case_id(name))
  );

CREATE POLICY "extras-images upload" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    bucket_id = 'extras-images'::text
    AND public._storage_user_can_see_case(public._storage_case_id(name))
  );
