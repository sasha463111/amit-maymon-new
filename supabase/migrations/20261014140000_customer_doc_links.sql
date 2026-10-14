-- Customer documents link (Amit, 2026-10-14): the clerk sends the customer a
-- personal link (WhatsApp) to upload the claim documents from the phone.
-- Security: only the SHA-256 of the token is stored; links expire after 72h
-- and can be revoked; the public page can only upload (all access goes
-- through the server with the service role — no anon policies at all).
CREATE TABLE IF NOT EXISTS public.customer_doc_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id      uuid NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  token_hash       text NOT NULL UNIQUE,
  created_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT now() + interval '72 hours',
  revoked_at       timestamptz,
  revoked_by       uuid REFERENCES public.profiles(id),
  opened_at        timestamptz,
  consent_at       timestamptz,
  consent_version  text,
  consent_ip       text,
  consent_ua       text,
  completed_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_customer_doc_links_referral ON public.customer_doc_links (referral_id);

ALTER TABLE public.customer_doc_links ENABLE ROW LEVEL SECURITY;
-- Staff read the links of referrals they can see (same rule as referral_documents).
CREATE POLICY customer_doc_links_select ON public.customer_doc_links FOR SELECT TO authenticated
USING (
  public.has_permission('create_referral')
  AND referral_id IN (SELECT r.id FROM public.referrals r
                      WHERE r.branch_id = ANY (public.get_my_branch_ids()) OR public.can_see_all_branches())
);
REVOKE ALL ON public.customer_doc_links FROM anon;
GRANT SELECT ON public.customer_doc_links TO authenticated;
-- Read-only for staff; every write goes through the server (service role).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.customer_doc_links FROM authenticated;

-- Which checklist item a file answers, and the audit trail of customer uploads.
ALTER TABLE public.referral_documents
  ADD COLUMN IF NOT EXISTS doc_kind      text,
  ADD COLUMN IF NOT EXISTS via_link_id   uuid REFERENCES public.customer_doc_links(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS upload_ip     text,
  ADD COLUMN IF NOT EXISTS upload_ua     text;

-- "הלקוח העלה מסמכים" → the referral clerks (+ CEO as INFO, bell only).
CREATE OR REPLACE FUNCTION public.notification_kind(p_type text, p_title text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_type IN ('PART_RETURN_NEW', 'PART_RETURN_OVERDUE_7', 'PART_RETURN_OVERDUE_14',
                    'SUPPLIER_STATEMENT_REMINDER', 'SUPPLIER_STATEMENT_FYI') THEN p_type
    WHEN p_type = 'CUSTOMER_DOCS'                        THEN 'REFERRAL'
    WHEN p_type = 'DIRECT_NOTE'                          THEN 'NOTE'
    WHEN p_title LIKE 'תזכורת — רכב ממתין לעבודה%'       THEN 'PAINTER_REMINDER'
    WHEN p_type = 'PAINTER_REQUEST'                      THEN 'PAINTER_REQUEST'
    WHEN p_title LIKE 'הבקשה שלך%'                       THEN 'PAINTER_ANSWER'
    WHEN p_title LIKE 'רכב נכנס לעבודה%'                 THEN 'ENTER_WORK'
    WHEN p_title LIKE 'חלקים הגיעו%'                     THEN 'PARTS_ARRIVED'
    WHEN p_type = 'READY_FOR_OFFICE'                     THEN 'CLOSURE'
    WHEN p_title LIKE '%הפני%'                           THEN 'REFERRAL'
    WHEN p_title LIKE 'תיק חדש נפתח%'                    THEN 'NEW_CASE'
    ELSE 'CASE_FLOW'
  END
$function$;
