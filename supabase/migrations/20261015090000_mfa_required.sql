-- 1) SECURITY FIX (found 2026-10-15): profiles_update_own + a table-wide
--    UPDATE grant let ANY signed-in user rewrite their own row — including
--    role, sees_all_branches, is_active, branch_ids (a painter could make
--    himself CEO; verified in a rolled-back test). Users no longer update
--    profiles directly; the CEO's edits go through server actions with the
--    service client (which also fixes those edits silently updating 0 rows
--    for other users).
revoke update on public.profiles from anon, authenticated;
grant update (email_notifications) on public.profiles to authenticated;

-- 2) Two-step login with Duo Mobile (TOTP), Amit 2026-10-15: "שיהיה לכולם".
--    Rolled out per person: mfa_required = true sends the person to /mfa
--    (enrol once with a QR code, then a 6-digit code on every new sign-in).
alter table public.profiles add column if not exists mfa_required boolean not null default false;
