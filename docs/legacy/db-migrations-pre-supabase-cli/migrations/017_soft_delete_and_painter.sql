-- 017: Soft delete on cases, bodywork advisor flag, painter requests + images,
--      document_type on case_documents. Storage bucket `painter-images` must
--      be created in Supabase Dashboard BEFORE running this migration.

-- ─── Soft delete on cases ────────────────────────────────────────────────
ALTER TABLE cases ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cases_deleted_at ON cases(deleted_at) WHERE deleted_at IS NULL;

-- ─── Bodywork advisor flag on profiles ───────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_bodywork_advisor BOOLEAN DEFAULT false;

-- Seed: SERVICE_MANAGER + SERVICE_ADVISOR default to bodywork advisors
UPDATE profiles
   SET is_bodywork_advisor = true
 WHERE role IN ('SERVICE_MANAGER', 'SERVICE_ADVISOR')
   AND is_bodywork_advisor IS DISTINCT FROM true;

-- ─── Painter requests ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS painter_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  description   TEXT NOT NULL,
  request_type  TEXT NOT NULL CHECK (request_type IN ('WORK', 'PARTS')),
  status        TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE')),
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_painter_requests_case ON painter_requests(case_id);

ALTER TABLE painter_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS painter_requests_select ON painter_requests;
CREATE POLICY painter_requests_select ON painter_requests
  FOR SELECT TO authenticated
  USING (
    case_id IN (
      SELECT c.id FROM cases c
       WHERE c.branch_id IN (SELECT branch_id FROM profiles WHERE id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
  );

DROP POLICY IF EXISTS painter_requests_insert ON painter_requests;
CREATE POLICY painter_requests_insert ON painter_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND case_id IN (
      SELECT c.id FROM cases c
       WHERE c.branch_id IN (SELECT branch_id FROM profiles WHERE id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
  );

DROP POLICY IF EXISTS painter_requests_update ON painter_requests;
CREATE POLICY painter_requests_update ON painter_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid() AND role IN ('SERVICE_MANAGER', 'CEO')
    )
  );

-- ─── Painter request images ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS painter_request_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES painter_requests(id) ON DELETE CASCADE,
  image_path  TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_painter_request_images_req ON painter_request_images(request_id);

ALTER TABLE painter_request_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS painter_request_images_select ON painter_request_images;
CREATE POLICY painter_request_images_select ON painter_request_images
  FOR SELECT TO authenticated
  USING (
    request_id IN (SELECT id FROM painter_requests)
  );

DROP POLICY IF EXISTS painter_request_images_insert ON painter_request_images;
CREATE POLICY painter_request_images_insert ON painter_request_images
  FOR INSERT TO authenticated
  WITH CHECK (
    request_id IN (SELECT id FROM painter_requests WHERE created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CEO')
  );

-- ─── Storage policies for painter-images bucket ──────────────────────────
-- The bucket itself must be created via Supabase Dashboard → Storage (private).
DROP POLICY IF EXISTS "painter-images authenticated upload" ON storage.objects;
CREATE POLICY "painter-images authenticated upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'painter-images');

DROP POLICY IF EXISTS "painter-images authenticated read" ON storage.objects;
CREATE POLICY "painter-images authenticated read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'painter-images');

-- ─── Document type on case_documents ─────────────────────────────────────
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS document_type TEXT;
