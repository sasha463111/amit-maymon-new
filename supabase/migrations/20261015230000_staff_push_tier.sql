-- Notification overload (Tomer 15/10, product review): for every role except
-- the CEO, EVERY notification pushed to the phone. The CEO already has a tier
-- (ceo_notification_tier: ACTION = push, INFO = bell only). Same idea for the
-- staff: push only what asks something of that person; the rest stays in the
-- bell (still visible, no ping).
--
-- staff_push(role, type, title) → true = push. Kinds come from
-- notification_kind(type, title).
create or replace function public.staff_push(p_role text, p_type text, p_title text)
returns boolean language sql immutable set search_path to '' as $$
  select case
    -- A personal note / a reminder addressed to you / your module's alerts: always.
    when p_type in ('DIRECT_NOTE', 'COLLECTION_REMINDER', 'PART_RETURN_NEW', 'PART_RETURN_OVERDUE_7',
                    'PART_RETURN_OVERDUE_14', 'SUPPLIER_STATEMENT_REMINDER', 'SUPPLIER_STATEMENT_FYI',
                    'CUSTOMER_DOCS') then true
    -- Advisors / service manager: only what needs them.
    when p_role in ('SERVICE_ADVISOR', 'SERVICE_MANAGER') then
      p_type in ('PAINTER_REQUEST', 'CEO_REJECTED', 'PENDING_APPROVAL', 'APPROVAL_NEEDED', 'APPROVAL_REQUIRED')
      or public.notification_kind(p_type, p_title) = 'PAINTER_REQUEST'
    -- Office: referrals and cases waiting for closure are its work.
    when p_role = 'OFFICE' then public.notification_kind(p_type, p_title) in ('REFERRAL', 'CLOSURE')
    -- Painters, warehouse, collections, bookkeeper, drivers: they only receive
    -- their own module's notifications anyway — push as before.
    else true
  end
$$;

-- dispatch_ceo_push: the same function as before + the staff tier.
create or replace function public.dispatch_ceo_push()
returns trigger language plpgsql security definer set search_path to '' as $function$
DECLARE
  v_secret text;
  v_role text;
BEGIN
  IF NEW.read THEN RETURN NEW; END IF;
  SELECT p.role::text INTO v_role FROM public.profiles p WHERE p.id = NEW.user_id AND p.is_active;
  IF v_role IS NULL THEN RETURN NEW; END IF;
  IF v_role = 'CEO' AND public.ceo_notification_tier(NEW.type, NEW.title) <> 'ACTION' THEN RETURN NEW; END IF;
  IF v_role <> 'CEO' AND NOT public.staff_push(v_role, NEW.type, NEW.title) THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id = NEW.user_id) THEN RETURN NEW; END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'push_dispatch_secret' LIMIT 1;
  PERFORM net.http_post(
    url := 'https://amit-maymon-new-psi.vercel.app/api/push/dispatch',
    body := jsonb_build_object('id', NEW.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', coalesce(v_secret, '')),
    timeout_milliseconds := 10000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dispatch push failed for notification %: %', NEW.id, SQLERRM;
  RETURN NEW;
END
$function$;
