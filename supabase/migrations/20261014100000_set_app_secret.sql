-- Store an allow-listed API key in Supabase Vault from a server-side script
-- (2026-10-14): Tomer saves the key in a local file, a script reads it and
-- calls this with the service-role key — the key never goes through chat.
-- Creates or replaces the secret. Service role only.
CREATE OR REPLACE FUNCTION public.set_app_secret(p_name text, p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_name NOT IN ('anthropic_api_key') THEN
    RAISE EXCEPTION 'secret name not allowed';
  END IF;
  IF coalesce(trim(p_value), '') = '' THEN
    RAISE EXCEPTION 'empty value';
  END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = p_name LIMIT 1;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(trim(p_value), p_name);
  ELSE
    PERFORM vault.update_secret(v_id, trim(p_value));
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.set_app_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_app_secret(text, text) TO service_role;
