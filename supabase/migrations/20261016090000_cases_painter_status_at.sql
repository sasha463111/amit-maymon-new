-- Design round C (16/10): "days in the current stage" on the painters board.
-- painter_status_at = when painter_status last changed, kept by a trigger.
alter table public.cases add column if not exists painter_status_at timestamptz;

create or replace function public.cases_touch_painter_status_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.painter_status is not null and new.painter_status_at is null then
      new.painter_status_at := now();
    end if;
  elsif new.painter_status is distinct from old.painter_status then
    new.painter_status_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists cases_painter_status_at on public.cases;
create trigger cases_painter_status_at
  before insert or update of painter_status on public.cases
  for each row execute function public.cases_touch_painter_status_at();

-- Backfill (best known): the last logged stage change, else the stage's own
-- timestamp, else when the case was opened.
with ev as (
  select entity_id as case_id, max(created_at) as at
  from public.audit_events
  where entity_type = 'CASE' and payload::text ilike '%painter_status%'
  group by entity_id
)
update public.cases c
set painter_status_at = coalesce(
  ev.at,
  case c.painter_status
    when 'IN_WORK' then c.painter_entered_work_at
    when 'PARTS_ARRIVED' then c.parts_arrived_at
    when 'READY_FOR_RELEASE' then c.painter_finished_at
    when 'WRITTEN_OFF' then c.written_off_at
  end,
  c.opened_at,
  c.created_at
)
from (select id from public.cases where painter_status is not null and painter_status_at is null) t
left join ev on ev.case_id = t.id
where c.id = t.id;
