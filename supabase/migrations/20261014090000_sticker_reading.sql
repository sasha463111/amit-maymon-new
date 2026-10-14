-- Sticker reading (Amit, 2026-10-14): the warehouse photographs the part's
-- sticker and Claude fills the return form. Two pieces:
-- 1) part_returns.sticker_date — the date printed on the sticker.
-- 2) get_app_secret(name) — lets the SERVER (service role only) read an API
--    key kept in Supabase Vault, so keys need no Vercel access. Allow-listed
--    names; revoked from public/anon/authenticated.
ALTER TABLE public.part_returns ADD COLUMN IF NOT EXISTS sticker_date date;

CREATE OR REPLACE FUNCTION public.get_app_secret(p_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = p_name AND p_name IN ('anthropic_api_key')
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_app_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_app_secret(text) TO service_role;
