-- "מפתח המוצר" (Tomer, 15/10): Tomer's account is the product developer —
-- a CEO in every permission (role stays CEO), shown as "מפתח המוצר", and the
-- account that gets the improvement-notes pushes. office_function 'DEVELOPER'
-- is allowed only together with role CEO.
alter table public.profiles drop constraint if exists profiles_office_function_check;
alter table public.profiles add constraint profiles_office_function_check check (
  office_function is null
  or office_function in ('REFERRALS', 'CLOSURE')
  or (office_function = 'DEVELOPER' and role = 'CEO')
);
update public.profiles
   set office_function = 'DEVELOPER', collections_manager = true, sees_all_branches = true
 where id = '1786a9fa-ac9c-4376-8746-f625343c3193';
