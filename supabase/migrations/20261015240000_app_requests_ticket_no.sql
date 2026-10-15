-- Ticket numbers on the bugs / features boards (Tomer 15/10: "שככה נוכל לדבר
-- בשפה משותפת"): every request gets a running number (#1, #2, …), shown on the
-- card, the boards, notifications and replies. Existing requests are numbered
-- by the order they were opened.
alter table public.app_requests add column if not exists ticket_no integer;

with ordered as (
  select id, row_number() over (order by created_at, id) as rn
  from public.app_requests
  where ticket_no is null
)
update public.app_requests r
   set ticket_no = o.rn + coalesce((select max(ticket_no) from public.app_requests), 0)
  from ordered o
 where r.id = o.id;

create sequence if not exists public.app_requests_ticket_no_seq owned by public.app_requests.ticket_no;
select setval('public.app_requests_ticket_no_seq', greatest(coalesce((select max(ticket_no) from public.app_requests), 0), 1));
alter table public.app_requests alter column ticket_no set default nextval('public.app_requests_ticket_no_seq');
alter table public.app_requests alter column ticket_no set not null;
create unique index if not exists app_requests_ticket_no_key on public.app_requests (ticket_no);

-- The terminal reply carries the number too.
create or replace function public.dev_reply_request(p_request uuid, p_body text, p_status text default null, p_commit text default null, p_notify boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare r public.app_requests;
begin
  select * into r from public.app_requests where id = p_request;
  if not found then raise exception 'request not found'; end if;
  if p_status is not null and p_status not in ('NEW', 'IN_PROGRESS', 'DONE', 'NO') then raise exception 'bad status'; end if;
  if p_status = 'DONE' and coalesce(trim(p_body), '') = '' then raise exception 'closing needs "מה בוצע"'; end if;
  insert into public.app_request_messages (request_id, body, author_id) values (p_request, p_body, null);
  update public.app_requests
     set status = coalesce(p_status, status), updated_at = now(), updated_by = null,
         pending_note = case when p_status is not null then p_body end, pending_commit = p_commit
   where id = p_request;
  if p_notify then
    insert into public.notifications (user_id, type, title, body, action_url)
    values (r.created_by, 'DIRECT_NOTE',
            case coalesce(p_status, '') when 'DONE' then '✅ הבקשה שלך בוצעה' when 'IN_PROGRESS' then '🔧 התחלנו לעבוד על הבקשה שלך' when 'NO' then '⏸ הבקשה שלך נדחתה לבינתיים' else '💡 תשובה על הבקשה שלך' end
              || ' · #' || r.ticket_no,
            left(p_body, 300), '/requests#' || p_request);
  end if;
end $$;
revoke all on function public.dev_reply_request(uuid, text, text, text, boolean) from public, anon, authenticated;
