-- Pinned "important notes" on a referral: things staff must not miss
-- (e.g. "customer arrives only on Tuesdays", "needs a replacement car").
-- Separate from the dated status log (referral_status_updates), which is a
-- history; this is a single always-visible field.
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS important_notes text;
