-- Referral file storage follows the permission matrix too
--
-- _storage_user_can_see_referral() still hard-coded p.role IN ('OFFICE','CEO').
-- That was exactly equivalent to create_referral's default, so nothing changes
-- for anyone today — but once the CEO grants create_referral to another role,
-- that user could open a referral and then be refused by storage when trying to
-- attach a file. Same half-granted-permission trap already avoided on
-- referral_documents and referral_status_updates.
--
-- Deliberately unchanged: _storage_user_can_see_case() stays branch-only. It
-- backs reading, uploading AND deleting case files, so gating it on
-- upload_documents would also block people from *viewing* files they are
-- allowed to see. Upload itself is enforced in documents.ts.
--
-- Safety check for existing users: OFFICE keeps create_referral = true, so
-- every OFFICE user (Ilana, Ilanit, Avia) evaluates identically to before.

CREATE OR REPLACE FUNCTION public._storage_user_can_see_referral (
  referral_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.referrals r
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE r.id = referral_id
      AND public.has_permission('create_referral')
      AND (p.role = 'CEO'
           OR p.sees_all_branches = true
           OR r.branch_id = ANY (p.branch_ids))
  )
$function$;
