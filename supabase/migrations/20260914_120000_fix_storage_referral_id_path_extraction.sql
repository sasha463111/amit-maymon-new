-- Fix _storage_referral_id function to extract correct path segment
-- The referral-documents bucket uses paths like: {referral_id}/{filename}
-- Example: 550e8400-e29b-41d4-a716-446655440000/1234567890-file.jpg
--
-- The function was extracting [2] (filename) instead of [1] (referral_id),
-- causing RLS check to fail with NULL and blocking all file uploads.
-- This fixes Ilana's file upload failures: "Storage: new row violates row-level security policy"

CREATE OR REPLACE FUNCTION public._storage_referral_id(name text) RETURNS uuid AS $$
BEGIN
  -- Extract referral_id from path's first segment (before first slash)
  RETURN (string_to_array(name, '/'))[1]::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Similar fix for cases (if needed - check current implementation)
-- Cases use path like: {case_id}/{filename}
CREATE OR REPLACE FUNCTION public._storage_case_id(name text) RETURNS uuid AS $$
BEGIN
  -- Extract case_id from path's first segment (before first slash)
  RETURN (string_to_array(name, '/'))[1]::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;
