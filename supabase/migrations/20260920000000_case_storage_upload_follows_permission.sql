-- Case-file UPLOAD follows upload_documents; read and delete stay branch-based
--
-- _storage_user_can_see_case() is deliberately branch-only because it backs
-- SELECT, INSERT and DELETE on the bucket — gating the helper itself on
-- upload_documents would also stop people from VIEWING files they are entitled
-- to see.
--
-- The consequence was that storage accepted an upload from any role with branch
-- access, including PAINTER, whose upload_documents is false. documents.ts does
-- block it, so the app behaved correctly, but the database layer disagreed with
-- the app layer — and defence in depth means the inner layer should not be more
-- permissive than the outer one.
--
-- Fix: split the concern. Keep the helper branch-only for read/delete, and add
-- the permission check to the INSERT policy only.
--
-- Verified before applying: OFFICE, SERVICE_MANAGER, SERVICE_ADVISOR and CEO all
-- have upload_documents = true, so no current user loses the ability to upload.

DROP POLICY IF EXISTS "case-documents upload" ON "storage"."objects";

CREATE POLICY "case-documents upload" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    bucket_id = 'case-documents'::text
    AND public._storage_user_can_see_case(public._storage_case_id(name))
    AND public.has_permission('upload_documents')
  );
