-- 039: Referral tracking module ("סטטוס הפניות") — new "referrals" +
-- "referral_documents" tables, RLS, and storage policies for a new
-- "referral-documents" bucket.
--
-- Scope: OFFICE + CEO only (this is the reception/coordination workflow —
-- Ilanit/Avia + Ilana + Amit — not something advisors/managers/painters need
-- to see), mirroring the existing /closure page's role gate.
--
-- Lifecycle: ACTIVE (default) → CONVERTED (case_id set, once a case is
-- created from this referral — see the app's "צור תיק מהפנייה" flow) or
-- CANCELLED (soft — kept for history like cases' deleted_at, not hard-deleted
-- despite the original request saying "תימחק" (deleted); both CONVERTED and
-- CANCELLED just drop out of the active list, same UX either way).
--
-- Bucket setup: create "referral-documents" in Supabase Dashboard → Storage
-- FIRST (private bucket, same as case-documents/painter-images/extras-images),
-- then run this migration.

CREATE TABLE IF NOT EXISTS referrals (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id          UUID NOT NULL REFERENCES branches(id),
  customer_name      TEXT,
  insurance_company  TEXT,
  claim_type         TEXT, -- free text here (pre-case — no workflow/enum to match yet)
  vehicle_type       TEXT,
  vehicle_year       INTEGER,
  plate_number       TEXT,
  appraiser_name     TEXT,
  phone              TEXT,
  status_note        TEXT, -- free-text status the reception staff write themselves
  status             TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CONVERTED', 'CANCELLED')),
  case_id            UUID REFERENCES cases(id), -- set when converted to a real case
  created_by         UUID REFERENCES profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_branch_id ON referrals(branch_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referrals_select ON referrals;
CREATE POLICY referrals_select ON referrals
  FOR SELECT TO authenticated
  USING (
    (branch_id = public.get_my_branch_id() OR public.can_see_all_branches())
    AND public.get_my_role() IN ('OFFICE', 'CEO')
  );

DROP POLICY IF EXISTS referrals_insert ON referrals;
CREATE POLICY referrals_insert ON referrals
  FOR INSERT TO authenticated
  WITH CHECK (
    (branch_id = public.get_my_branch_id() OR public.can_see_all_branches())
    AND public.get_my_role() IN ('OFFICE', 'CEO')
  );

DROP POLICY IF EXISTS referrals_update ON referrals;
CREATE POLICY referrals_update ON referrals
  FOR UPDATE TO authenticated
  USING (
    (branch_id = public.get_my_branch_id() OR public.can_see_all_branches())
    AND public.get_my_role() IN ('OFFICE', 'CEO')
  );

DROP TRIGGER IF EXISTS referrals_updated_at ON referrals;
CREATE TRIGGER referrals_updated_at
  BEFORE UPDATE ON referrals
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Documents (same shape as case_documents / 005)
CREATE TABLE IF NOT EXISTS referral_documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referral_id   UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL,
  file_path     TEXT NOT NULL, -- storage path in referral-documents bucket: <referral_uuid>/...
  file_size     BIGINT,
  mime_type     TEXT,
  uploaded_by   UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_documents_referral_id ON referral_documents(referral_id);

ALTER TABLE referral_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_documents_select ON referral_documents;
CREATE POLICY referral_documents_select ON referral_documents
  FOR SELECT TO authenticated
  USING (
    referral_id IN (
      SELECT id FROM referrals
      WHERE branch_id = public.get_my_branch_id() OR public.can_see_all_branches()
    )
    AND public.get_my_role() IN ('OFFICE', 'CEO')
  );

DROP POLICY IF EXISTS referral_documents_insert ON referral_documents;
CREATE POLICY referral_documents_insert ON referral_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    referral_id IN (
      SELECT id FROM referrals
      WHERE branch_id = public.get_my_branch_id() OR public.can_see_all_branches()
    )
    AND public.get_my_role() IN ('OFFICE', 'CEO')
    AND uploaded_by = auth.uid()
  );

DROP POLICY IF EXISTS referral_documents_delete ON referral_documents;
CREATE POLICY referral_documents_delete ON referral_documents
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.get_my_role() IN ('OFFICE', 'CEO'));

-- Storage RLS for the "referral-documents" bucket — same pattern as 022b's
-- _storage_user_can_see_case, one level up for referrals.
CREATE OR REPLACE FUNCTION public._storage_referral_id(name text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(split_part(name, '/', 1), '')::uuid
$$;

CREATE OR REPLACE FUNCTION public._storage_user_can_see_referral(referral_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.referrals r
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE r.id = referral_id
      AND p.role IN ('OFFICE', 'CEO')
      AND (p.role = 'CEO' OR p.branch_id = r.branch_id OR p.sees_all_branches = true)
  )
$$;

GRANT EXECUTE ON FUNCTION public._storage_referral_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._storage_user_can_see_referral(uuid) TO authenticated;

DROP POLICY IF EXISTS "referral-documents read" ON storage.objects;
CREATE POLICY "referral-documents read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'referral-documents' AND public._storage_user_can_see_referral(public._storage_referral_id(name)));

DROP POLICY IF EXISTS "referral-documents upload" ON storage.objects;
CREATE POLICY "referral-documents upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'referral-documents' AND public._storage_user_can_see_referral(public._storage_referral_id(name)));

DROP POLICY IF EXISTS "referral-documents delete" ON storage.objects;
CREATE POLICY "referral-documents delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'referral-documents' AND public._storage_user_can_see_referral(public._storage_referral_id(name)));

INSERT INTO schema_migrations (filename) VALUES ('039_referrals.sql')
ON CONFLICT (filename) DO NOTHING;
